param([string]$InstallRoot = 'C:\local-software\StaianoHVAC\application')
$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $PSCommandPath + '"'), '-InstallRoot', ('"' + $InstallRoot + '"'))
  $elevated = Start-Process -FilePath powershell.exe -ArgumentList $arguments -Verb RunAs -WindowStyle Hidden -Wait -PassThru
  exit $elevated.ExitCode
}
$sourceRoot = Split-Path -Parent $PSScriptRoot
Start-Transcript -Path (Join-Path $sourceRoot '.cache\install-executable.detail.log') -Append | Out-Null
$release = Get-Content -LiteralPath (Join-Path $sourceRoot 'dist-exe\release.json') -Raw | ConvertFrom-Json
$sourceExe = Join-Path $sourceRoot 'dist-exe\StaianoHVAC.exe'
if ((Get-FileHash -LiteralPath $sourceExe -Algorithm SHA256).Hash.ToLowerInvariant() -ne $release.sha256) { throw 'EXE diverso dalla build verificata.' }
$InstallRoot = [IO.Path]::GetFullPath($InstallRoot)
$dataRoot = Join-Path $InstallRoot 'data'
$versionRoot = Join-Path $InstallRoot ('versions\' + $release.sha256)
$exe = Join-Path $versionRoot 'StaianoHVAC.exe'
$existingInstall = Test-Path -LiteralPath (Join-Path $InstallRoot 'active.json')
$currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
if (-not (Test-Path -LiteralPath $InstallRoot)) {
  $security = New-Object Security.AccessControl.DirectorySecurity
  $security.SetAccessRuleProtection($true, $false)
  foreach ($sid in @($currentSid, 'S-1-5-18', 'S-1-5-32-544')) {
    $rule = New-Object Security.AccessControl.FileSystemAccessRule([Security.Principal.SecurityIdentifier]::new($sid), 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $security.AddAccessRule($rule)
  }
  [IO.Directory]::CreateDirectory($InstallRoot, $security) | Out-Null
}
# Check existing protection without modifying existing files or their ACLs.
foreach ($rule in (Get-Acl -LiteralPath $InstallRoot).Access) {
  $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
  if ($rule.AccessControlType -eq 'Allow' -and $sid -notin @($currentSid, 'S-1-5-18', 'S-1-5-32-544')) { throw 'Cartella di installazione accessibile ad altri utenti. Scegliere una cartella privata nuova.' }
}
New-Item -ItemType Directory -Path $versionRoot,(Join-Path $dataRoot '.cache') -Force | Out-Null
if (-not (Test-Path -LiteralPath $exe) -or (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant() -ne $release.sha256) { Copy-Item -LiteralPath $sourceExe -Destination $exe -Force }

function Copy-ApplicationData {
  foreach ($name in @('app-auth.json','shared-projects.json','license.json','license-public.pem')) {
    $source = Join-Path $sourceRoot ('.cache\' + $name)
    $target = Join-Path $dataRoot ('.cache\' + $name)
    if ((Test-Path -LiteralPath $source) -and (-not $existingInstall -or -not (Test-Path -LiteralPath $target))) { Copy-Item -LiteralPath $source -Destination $target -Force }
  }
}
Copy-ApplicationData
# The customer installation never receives the administrative or signing credentials.
$settings = Get-Content -LiteralPath (Join-Path $sourceRoot '.env.local') | Where-Object { $_ -match '^LICENSE_(TOLERANCE|CHECK)_MINUTES=' }
[IO.File]::WriteAllLines((Join-Path $dataRoot '.env.local'), [string[]]$settings)
$catalog = Join-Path $sourceRoot 'catalog-data\sources'
if (Test-Path -LiteralPath $catalog) {
  New-Item -ItemType Directory -Path (Join-Path $dataRoot 'catalog-data\sources') -Force | Out-Null
  & robocopy.exe $catalog (Join-Path $dataRoot 'catalog-data\sources') '*.pdf' '*.html' '*.xlsx' '*.xls' /S /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw 'Copia dei documenti tecnici non riuscita.' }
}

# First exercise the actual EXE on a separate port, with production data copied above.
$env:STAIANO_EXE_TEST_PORT = '3016'
$testProcess = Start-Process -FilePath $exe -ArgumentList @('--serve','--data-dir',('"' + $dataRoot + '"')) -WorkingDirectory $versionRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $dataRoot '.cache\exe-test.stdout.log') -RedirectStandardError (Join-Path $dataRoot '.cache\exe-test.stderr.log')
Remove-Item Env:STAIANO_EXE_TEST_PORT
try {
  $ready = $false
  for ($attempt=0; $attempt -lt 90; $attempt++) {
    Start-Sleep -Seconds 1
    if ($testProcess.HasExited) { throw 'EXE terminato durante il collaudo. Consultare exe-test.stderr.log.' }
    try {
      $response = Invoke-WebRequest 'http://127.0.0.1:3016/accedi' -UseBasicParsing -TimeoutSec 3
      $ready = $response.StatusCode -eq 200 -and $response.Headers['X-Staiano-Build'] -eq $release.buildId -and $response.Content -match 'Staiano'
      if ($ready) { break }
    } catch { }
  }
  if (-not $ready) { throw 'EXE non verificato sulla porta di collaudo. Produzione invariata.' }
} finally {
  if (-not $testProcess.HasExited) { Stop-Process -Id $testProcess.Id -Force }
}

$task = Get-ScheduledTask -TaskName 'Staiano HVAC'
$oldActions = $task.Actions
$taskBackup = Join-Path $dataRoot '.cache\previous-server-task.xml'
Export-ScheduledTask -TaskName 'Staiano HVAC' | Set-Content -LiteralPath $taskBackup -Encoding Unicode
$recordSource = if ($existingInstall) { Join-Path $dataRoot '.cache\production-server.json' } else { Join-Path $sourceRoot '.cache\production-server.json' }
$previousRecord = Get-Content -LiteralPath $recordSource -Raw | ConvertFrom-Json
try {
  & schtasks.exe /End /TN 'Staiano HVAC' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Arresto attivita non riuscito.' }
  $deadline = (Get-Date).AddSeconds(30)
  while ((Get-ScheduledTask -TaskName 'Staiano HVAC').State -ne 'Ready') { if ((Get-Date) -gt $deadline) { throw 'Attivita non arrestata.' }; Start-Sleep -Milliseconds 250 }
  $listener = Get-NetTCPConnection -State Listen -LocalPort 3015 -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($listener) {
    $owner = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $listener.OwningProcess)
    $started = [DateTimeOffset]::Parse([string]$previousRecord.startedAt)
    if ($listener.OwningProcess -ne $previousRecord.pid -or [Math]::Abs(([DateTimeOffset]$owner.CreationDate - $started).TotalSeconds) -gt 5) { throw 'Processo sulla porta 3015 non riconosciuto.' }
    Stop-Process -Id $listener.OwningProcess -Force
  }
  Copy-ApplicationData
  $action = New-ScheduledTaskAction -Execute $exe -Argument ('--serve --data-dir "' + $dataRoot + '"') -WorkingDirectory $versionRoot
  Set-ScheduledTask -TaskName 'Staiano HVAC' -Action $action | Out-Null
  $last = (Get-ScheduledTaskInfo -TaskName 'Staiano HVAC').LastRunTime
  & schtasks.exe /Run /TN 'Staiano HVAC' | Out-Null
  Start-Sleep -Seconds 2
  if ((Get-ScheduledTaskInfo -TaskName 'Staiano HVAC').LastRunTime -le $last) { Start-ScheduledTask -TaskName 'Staiano HVAC' }
  $ready = $false
  for ($attempt=0; $attempt -lt 60; $attempt++) {
    Start-Sleep -Seconds 1
    try {
      $record = Get-Content -LiteralPath (Join-Path $dataRoot '.cache\production-server.json') -Raw | ConvertFrom-Json
      $response = Invoke-WebRequest 'http://127.0.0.1:3015/accedi' -UseBasicParsing -TimeoutSec 3
      $ready = $record.buildId -eq $release.buildId -and $record.executable -eq $exe -and $response.StatusCode -eq 200 -and $response.Headers['X-Staiano-Build'] -eq $release.buildId
      if ($ready) { break }
    } catch { }
  }
  if (-not $ready) { throw 'Nuova produzione non verificata: ripristino dell attivita precedente.' }
  $activeJson = @{ executable=$exe; sequence=0; commit=$release.commit; sha256=$release.sha256 } | ConvertTo-Json
  [IO.File]::WriteAllText((Join-Path $InstallRoot 'active.json'), $activeJson, [Text.UTF8Encoding]::new($false))
  # The authoritative record lives with the installed data; the development copy is only a convenience.
  try { Copy-Item -LiteralPath (Join-Path $dataRoot '.cache\production-server.json') -Destination (Join-Path $sourceRoot '.cache\production-server.json') -Force } catch { Write-Warning 'Record della copia sviluppo non aggiornato; usare il record nella cartella application\data.' }
  $updateAction = New-ScheduledTaskAction -Execute $exe -Argument ('--update --data-dir "' + $dataRoot + '"') -WorkingDirectory $versionRoot
  $updateTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Minutes 5)
  $updateSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
  $updatePrincipal = New-ScheduledTaskPrincipal -UserId $task.Principal.UserId -LogonType S4U -RunLevel Highest
  Register-ScheduledTask -TaskName 'Staiano HVAC Update' -Action $updateAction -Trigger $updateTrigger -Settings $updateSettings -Principal $updatePrincipal -Description 'Verifica pacchetti EXE firmati con licenza attiva; nessun sorgente o compilatore necessario.' -Force | Out-Null
  Write-Output ('EXE installato e attivo. Build ' + $record.buildId + ', PID ' + $record.pid + '. Aggiornamenti ogni 5 minuti.')
} catch {
  $failure = $_
  Write-Error $failure -ErrorAction Continue
  try { Set-ScheduledTask -TaskName 'Staiano HVAC' -Action $oldActions | Out-Null; Start-ScheduledTask -TaskName 'Staiano HVAC' } catch { Write-Warning ('Ripristino attivita: '+$_.Exception.Message) }
  throw $failure
} finally {
  Stop-Transcript | Out-Null
}
