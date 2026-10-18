param([switch]$SkipPull)

$ErrorActionPreference = 'Stop'
$updateRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $updateRoot
$updateTask = Get-ScheduledTask -TaskName 'Staiano HVAC' -ErrorAction SilentlyContinue
if ($updateTask) {
    $updateIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $updatePrincipal = [Security.Principal.WindowsPrincipal]::new($updateIdentity)
    if (-not $updatePrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        $updateArguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $PSCommandPath + '"'))
        if ($SkipPull) { $updateArguments += '-SkipPull' }
        $updateElevated = Start-Process -FilePath powershell.exe -ArgumentList $updateArguments -Verb RunAs -WindowStyle Hidden -Wait -PassThru
        exit $updateElevated.ExitCode
    }
}
New-Item -ItemType Directory -Path (Join-Path $updateRoot '.cache') -Force | Out-Null
Start-Transcript -Path (Join-Path $updateRoot '.cache\update-project.log') -Append | Out-Null

function Invoke-Checked([string]$Command, [string[]]$Arguments) {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command non riuscito (codice $LASTEXITCODE). Server non aggiornato." }
}

function Stop-StaianoTask {
    if ((Get-ScheduledTask -TaskName 'Staiano HVAC').State -eq 'Running') {
        Invoke-Checked schtasks.exe @('/End', '/TN', 'Staiano HVAC')
    }
    $updateStopDeadline = (Get-Date).AddSeconds(30)
    do {
        $updateState = (Get-ScheduledTask -TaskName 'Staiano HVAC').State
        if ($updateState -eq 'Ready') { return }
        Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $updateStopDeadline)
    throw 'Attivita non arrestata entro 30 secondi. Aggiornamento interrotto.'
}

try {
    if (-not $SkipPull) {
        $updateChanges = & git status --porcelain
        if ($LASTEXITCODE -ne 0) { throw 'Impossibile leggere lo stato Git.' }
        if ($updateChanges) { throw 'Modifiche locali presenti: eseguire commit o stash prima di aggiornare. Nessun file sovrascritto.' }
        Invoke-Checked git @('pull', '--ff-only')
    }
    $updateNode = & node -p 'process.versions.node'
    if ($LASTEXITCODE -ne 0 -or [version]$updateNode -lt [version]'22.13.0') { throw 'Installare Node.js >=22.13.0.' }

    $updateStart = Join-Path $PSScriptRoot 'start-production.ps1'
    if ($updateTask -and -not ($updateTask.Actions | Where-Object { $_.Arguments -like ('*"' + $updateStart + '"*') })) {
        throw 'Attivita Staiano HVAC associata a una copia diversa. Eseguire lo script nella copia del server.'
    }
    $updateRecordPath = Join-Path $updateRoot '.cache\production-server.json'
    $updatePrevious = if (Test-Path -LiteralPath $updateRecordPath) { Get-Content -LiteralPath $updateRecordPath -Raw | ConvertFrom-Json }
    $updateDirectory = if ($updatePrevious.buildDirectory -eq '.next') { '.next-update' } else { '.next' }
    $env:STAIANO_BUILD_DIR = $updateDirectory
    # Windows keeps native dependency files locked while Next is running.
    if ($updateTask) { Stop-StaianoTask }
    if ($updatePrevious) {
        $updateListener = Get-NetTCPConnection -State Listen -LocalPort 3015 -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($updateListener) {
            $updateOwner = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $updateListener.OwningProcess)
            $updateKnownCommand = $updateOwner.CommandLine -like ('*' + (Join-Path $updateRoot 'node_modules\next\dist\bin\next') + '*start*--port 3015*')
            $updateRecordedStart = [DateTimeOffset]::Parse([string]$updatePrevious.startedAt)
            $updateSameProcess = $updateOwner.ProcessId -eq $updatePrevious.pid -and [Math]::Abs(([DateTimeOffset]$updateOwner.CreationDate - $updateRecordedStart).TotalSeconds) -lt 5
            if (-not $updateSameProcess -or ($updateOwner.CommandLine -and -not $updateKnownCommand)) {
                throw 'La porta 3015 appartiene a un processo non riconosciuto. Nessun processo terminato.'
            }
            Stop-Process -Id $updateOwner.ProcessId -ErrorAction Stop
            Start-Sleep -Seconds 1
        }
    }
    Invoke-Checked npm.cmd @('ci')
    $updateNextEnv = Join-Path $updateRoot 'next-env.d.ts'
    $updateNextEnvText = [IO.File]::ReadAllText($updateNextEnv)
    try {
        Invoke-Checked npm.cmd @('run', 'build')
        Invoke-Checked npm.cmd @('run', 'typecheck')
    } finally {
        # Next rewrites this tracked generated file with the active distDir.
        [IO.File]::WriteAllText($updateNextEnv, $updateNextEnvText)
    }
    $updateBuild = (Get-Content -LiteralPath (Join-Path $updateRoot "$updateDirectory\BUILD_ID") -Raw).Trim()
    if (-not $updateBuild) { throw 'La compilazione non ha prodotto un BUILD_ID.' }

    if ($updateTask) {
        Stop-StaianoTask
        $updateLastRun = (Get-ScheduledTaskInfo -TaskName 'Staiano HVAC').LastRunTime
        Invoke-Checked schtasks.exe @('/Run', '/TN', 'Staiano HVAC')
        Start-Sleep -Seconds 2
        if ((Get-ScheduledTaskInfo -TaskName 'Staiano HVAC').LastRunTime -le $updateLastRun) {
            Start-ScheduledTask -TaskName 'Staiano HVAC'
        }
    } else {
        # On a development PC, start locally without registering a server task.
        & $updateStart
        if ($LASTEXITCODE -ne 0) { throw 'Avvio locale non riuscito.' }
    }
    $updateDeadline = (Get-Date).AddSeconds(45)
    $updateReady = $false
    do {
        try {
            $updateRecord = Get-Content -LiteralPath $updateRecordPath -Raw | ConvertFrom-Json
            $updateResponse = Invoke-WebRequest 'http://127.0.0.1:3015/' -UseBasicParsing -TimeoutSec 3
            $updateProcess = Get-Process -Id $updateRecord.pid -ErrorAction Stop
            $updateReady = $updateRecord.buildId -eq $updateBuild -and $updateRecord.buildDirectory -eq $updateDirectory -and
                $updateProcess -and $updateResponse.StatusCode -eq 200 -and
                $updateResponse.Content -match 'Staiano' -and
                (-not $updatePrevious -or $updateRecord.pid -ne $updatePrevious.pid)
            if ($updateReady) { break }
        } catch { }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $updateDeadline)
    if (-not $updateReady) { throw 'Nuova build non verificata su porta 3015. Consultare .cache/server.stderr.log e production-server.json.' }
    Write-Output "Staiano aggiornato: build $updateBuild, PID $($updateRecord.pid), http://127.0.0.1:3015"
    Stop-Transcript | Out-Null
} catch {
    Write-Error $_ -ErrorAction Continue
    Stop-Transcript | Out-Null
    exit 1
}
