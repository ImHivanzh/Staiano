$ErrorActionPreference = 'Stop'
$taskAppRoot = Split-Path -Parent $PSScriptRoot
$taskCache = Join-Path $taskAppRoot '.cache'
$taskNextCli = Join-Path $taskAppRoot 'node_modules\next\dist\bin\next'
$taskBuildId = (Get-Content -LiteralPath (Join-Path $taskAppRoot '.next\BUILD_ID') -Raw -ErrorAction SilentlyContinue).Trim()
if (-not (Test-Path -LiteralPath (Join-Path $taskAppRoot '.next\BUILD_ID'))) {
    throw 'Build assente. Eseguire npm run build prima di avviare la produzione.'
}
$taskListener = Get-NetTCPConnection -State Listen -LocalPort 3015 -ErrorAction SilentlyContinue | Select-Object -First 1
if ($taskListener) {
    $taskOwner = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $taskListener.OwningProcess)
    if ($taskOwner.CommandLine -notlike '*staiano-3d*node_modules*next*start*--port 3015*') {
        throw 'La porta3015 e occupata da un altro servizio. Nessun processo e stato terminato.'
    }
    $taskResponse = Invoke-WebRequest -Uri 'http://127.0.0.1:3015/' -TimeoutSec 10
    if ($taskResponse.StatusCode -ne 200 -or ($taskResponse.Content -notmatch '<title>Staiano \| Configuratore HVAC</title>' -and $taskResponse.Content -notmatch '<title>Accesso — Staiano</title>')) {
        throw 'La porta3015 e occupata da un altro servizio. Nessun processo e stato terminato.'
    }
    @{ pid=$taskListener.OwningProcess; startedAt=$taskOwner.CreationDate.ToString('o'); domain='hvac.internal.staianopoint.com'; buildId=$taskBuildId } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskCache 'production-server.json') -Encoding utf8
    Write-Output 'Staiano HVAC attivo: https://hvac.internal.staianopoint.com'
    exit 0
}
New-Item -ItemType Directory -Path $taskCache -Force | Out-Null
$taskNode = (Get-Command node -ErrorAction Stop).Source
$taskProcess = Start-Process -FilePath $taskNode -ArgumentList @('"' + $taskNextCli + '"', 'start', '--hostname', '127.0.0.1', '--port', '3015') -WorkingDirectory $taskAppRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskCache 'server.stdout.log') -RedirectStandardError (Join-Path $taskCache 'server.stderr.log')
$taskReady = $false
for ($taskAttempt = 0; $taskAttempt -lt 40; $taskAttempt++) {
    Start-Sleep -Milliseconds 250
    if ($taskProcess.HasExited) { throw 'Avvio fallito. Consultare .cache/server.stderr.log.' }
    try {
        $taskResponse = Invoke-WebRequest -Uri 'http://127.0.0.1:3015/' -TimeoutSec 2
        if ($taskResponse.StatusCode -eq 200 -and ($taskResponse.Content -match '<title>Staiano \| Configuratore HVAC</title>' -or $taskResponse.Content -match '<title>Accesso — Staiano</title>')) { $taskReady = $true; break }
    } catch { }
}
if (-not $taskReady) { throw 'Il processo e stato avviato, ma non risponde ancora. Consultare i log locali.' }
@{ pid = $taskProcess.Id; startedAt = (Get-Date).ToString('o'); domain = 'hvac.internal.staianopoint.com'; buildId = $taskBuildId } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskCache 'production-server.json') -Encoding utf8
Write-Output ('Staiano HVAC avviato in background, PID ' + $taskProcess.Id + ': https://hvac.internal.staianopoint.com')
