param(
    [switch]$Supervise,
    [string]$NodePath
)

$ErrorActionPreference = 'Stop'
$taskAppRoot = Split-Path -Parent $PSScriptRoot
$taskCache = Join-Path $taskAppRoot '.cache'
$taskNextCli = Join-Path $taskAppRoot 'node_modules\next\dist\bin\next'
$taskBuildFile = @('.next', '.next-update') | ForEach-Object {
    $taskCandidate = Join-Path $taskAppRoot ($_ + '\BUILD_ID')
    if (Test-Path -LiteralPath $taskCandidate) { Get-Item -LiteralPath $taskCandidate }
} | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $taskBuildFile) {
    throw 'Build assente. Eseguire npm run build prima di avviare la produzione.'
}
$taskBuildId = (Get-Content -LiteralPath $taskBuildFile.FullName -Raw).Trim()
$taskBuildTime = $taskBuildFile.LastWriteTime
$taskBuildDirectory = $taskBuildFile.Directory.Name
$env:STAIANO_BUILD_DIR = $taskBuildDirectory
$env:STAIANO_RELEASE_ID = $taskBuildId
$taskNewerSource = Get-ChildItem -LiteralPath (Join-Path $taskAppRoot 'src') -Recurse -File | Where-Object { $_.LastWriteTime -gt $taskBuildTime } | Select-Object -First 1
if ($taskNewerSource) {
    throw 'Build precedente alle modifiche. Eseguire npm run build, poi avvia-produzione.bat. Il solo riavvio non aggiorna l''interfaccia.'
}
New-Item -ItemType Directory -Path $taskCache -Force | Out-Null

function Test-StaianoResponse($Response) {
    return $Response.StatusCode -eq 200 -and (
        $Response.Content -match '<title>Staiano \| Configuratore HVAC</title>' -or
        $Response.Content -match '<title>Accesso [^<]*Staiano</title>'
    )
}

function Wait-StaianoProcess([int]$ProcessId, [datetime]$CreatedAt) {
    if ($Supervise) {
        do {
            Start-Sleep -Seconds 5
            $taskRunning = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $ProcessId)
        } while ($taskRunning -and [Math]::Abs(($taskRunning.CreationDate - $CreatedAt).TotalSeconds) -lt 0.01)
        throw 'Processo Staiano HVAC terminato. L''attivita Windows riprovera tra un minuto.'
    }
}

$taskListener = Get-NetTCPConnection -State Listen -LocalPort 3015 -ErrorAction SilentlyContinue | Select-Object -First 1
if ($taskListener) {
    $taskOwner = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $taskListener.OwningProcess)
    $taskKnownProcess = $taskOwner.CommandLine -like ('*' + $taskNextCli + '*start*--port 3015*')
    $taskRecordPath = Join-Path $taskCache 'production-server.json'
    # Windows may hide the command line across interactive and S4U logon sessions.
    # Compare PID and creation time to the private record before accepting that process.
    if (-not $taskOwner.CommandLine -and (Test-Path -LiteralPath $taskRecordPath)) {
        $taskRecord = Get-Content -LiteralPath $taskRecordPath -Raw | ConvertFrom-Json
        $taskRecordedStart = if ($taskRecord.startedAt -is [datetime]) { [DateTimeOffset]$taskRecord.startedAt } else { [DateTimeOffset]::Parse($taskRecord.startedAt) }
        $taskTimeDifference = ([DateTimeOffset]$taskOwner.CreationDate - $taskRecordedStart).TotalSeconds
        $taskKnownProcess = $taskRecord.pid -eq $taskListener.OwningProcess -and [Math]::Abs($taskTimeDifference) -lt 5
    }
    if (-not $taskKnownProcess) {
        throw 'La porta 3015 e occupata da un altro servizio. Nessun processo e stato terminato.'
    }
    $taskResponse = Invoke-WebRequest -Uri 'http://127.0.0.1:3015/' -UseBasicParsing -TimeoutSec 10
    if (-not (Test-StaianoResponse $taskResponse)) {
        throw 'La porta 3015 e occupata da un altro servizio. Nessun processo e stato terminato.'
    }
    if ($taskOwner.CreationDate -lt $taskBuildTime -or $taskResponse.Headers['X-Staiano-Build'] -ne $taskBuildId) {
        Stop-Process -Id $taskListener.OwningProcess -ErrorAction Stop
        for ($taskStopAttempt = 0; $taskStopAttempt -lt 40; $taskStopAttempt++) {
            if (-not (Get-NetTCPConnection -State Listen -LocalPort 3015 -ErrorAction SilentlyContinue)) { break }
            Start-Sleep -Milliseconds 100
        }
        Write-Output 'Riavvio del processo Staiano verificato con la build aggiornata.'
    } else {
        @{ pid=$taskListener.OwningProcess; startedAt=$taskOwner.CreationDate.ToString('o'); domain='hvac.internal.staianopoint.com'; buildId=$taskBuildId; buildDirectory=$taskBuildDirectory } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskCache 'production-server.json') -Encoding utf8
        Write-Output 'Staiano HVAC attivo: https://hvac.internal.staianopoint.com'
        Wait-StaianoProcess -ProcessId $taskListener.OwningProcess -CreatedAt $taskOwner.CreationDate
        exit 0
    }
}
if (-not $NodePath) { $NodePath = (Get-Command node -ErrorAction Stop).Source }
$taskNode = (Get-Item -LiteralPath $NodePath -ErrorAction Stop).FullName
$taskProcess = Start-Process -FilePath $taskNode -ArgumentList @('"' + $taskNextCli + '"', 'start', '--hostname', '127.0.0.1', '--port', '3015') -WorkingDirectory $taskAppRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskCache 'server.stdout.log') -RedirectStandardError (Join-Path $taskCache 'server.stderr.log')
$taskReady = $false
for ($taskAttempt = 0; $taskAttempt -lt 40; $taskAttempt++) {
    Start-Sleep -Milliseconds 250
    if ($taskProcess.HasExited) { throw 'Avvio fallito. Consultare .cache/server.stderr.log.' }
    try {
        $taskResponse = Invoke-WebRequest -Uri 'http://127.0.0.1:3015/' -UseBasicParsing -TimeoutSec 2
        if ((Test-StaianoResponse $taskResponse) -and $taskResponse.Headers['X-Staiano-Build'] -eq $taskBuildId) { $taskReady = $true; break }
    } catch { }
}
if (-not $taskReady) { throw 'Il processo e stato avviato, ma non risponde ancora. Consultare i log locali.' }
@{ pid = $taskProcess.Id; startedAt = $taskProcess.StartTime.ToString('o'); domain = 'hvac.internal.staianopoint.com'; buildId = $taskBuildId; buildDirectory=$taskBuildDirectory } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskCache 'production-server.json') -Encoding utf8
Write-Output ('Staiano HVAC avviato in background, PID ' + $taskProcess.Id + ': https://hvac.internal.staianopoint.com')
Wait-StaianoProcess -ProcessId $taskProcess.Id -CreatedAt $taskProcess.StartTime
