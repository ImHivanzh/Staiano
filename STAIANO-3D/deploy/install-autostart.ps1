param(
    [Parameter(Mandatory = $true)]
    [string]$RunAsUser,
    [Parameter(Mandatory = $true)]
    [string]$NodePath
)

$ErrorActionPreference = 'Stop'
$taskName = 'Staiano HVAC'
$taskAppRoot = Split-Path -Parent $PSScriptRoot
$taskCache = Join-Path $taskAppRoot '.cache'
$taskStatusFile = Join-Path $taskCache 'autostart-install.json'
New-Item -ItemType Directory -Path $taskCache -Force | Out-Null

try {
    $taskIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $taskAdmin = [Security.Principal.WindowsPrincipal]::new($taskIdentity)
    if (-not $taskAdmin.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Eseguire questo script come amministratore per registrare l''avvio del computer.'
    }
    $taskStartScript = Join-Path $PSScriptRoot 'start-production.ps1'
    foreach ($taskRequired in @($NodePath, $taskStartScript)) {
        if (-not (Test-Path -LiteralPath $taskRequired -PathType Leaf)) {
            throw ('File richiesto assente: ' + $taskRequired)
        }
    }
    if (-not ((Test-Path -LiteralPath (Join-Path $taskAppRoot '.next\BUILD_ID')) -or (Test-Path -LiteralPath (Join-Path $taskAppRoot '.next-update\BUILD_ID')))) {
        throw 'Build assente. Eseguire npm run build prima di installare l''avvio automatico.'
    }
    $taskUserSid = ([Security.Principal.NTAccount]::new($RunAsUser)).Translate([Security.Principal.SecurityIdentifier]).Value
    $taskExisting = Get-ScheduledTask -TaskName $taskName -TaskPath '\' -ErrorAction SilentlyContinue
    if ($taskExisting) {
        if (-not ($taskExisting.Actions | Where-Object { $_.Arguments -like ('*"' + $taskStartScript + '"*') })) {
            throw 'Esiste gia un''attivita Staiano HVAC per un altro percorso. Nessuna modifica applicata.'
        }
        Export-ScheduledTask -TaskName $taskName -TaskPath '\' | Set-Content -LiteralPath (Join-Path $taskCache 'autostart-task.previous.xml') -Encoding Unicode
        if ($taskExisting.State -eq 'Running') {
            throw 'Attivita gia in esecuzione. Arrestarla prima di reinstallare l''avvio automatico.'
        }
    }
    $taskPowerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $taskArguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $taskStartScript + '" -Supervise -NodePath "' + $NodePath + '"'
    $taskAction = New-ScheduledTaskAction -Execute $taskPowerShell -Argument $taskArguments -WorkingDirectory $taskAppRoot
    $taskTrigger = New-ScheduledTaskTrigger -AtStartup
    $taskTrigger.Delay = 'PT15S'
    $taskPrincipal = New-ScheduledTaskPrincipal -UserId $taskUserSid -LogonType S4U -RunLevel Limited
    $taskSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
    $taskDefinition = New-ScheduledTask -Action $taskAction -Trigger $taskTrigger -Principal $taskPrincipal -Settings $taskSettings -Description 'Staiano HVAC: produzione su 127.0.0.1:3015, avvio del computer senza login, riavvio su errore.'
    Register-ScheduledTask -TaskName $taskName -TaskPath '\' -InputObject $taskDefinition -Force | Out-Null
    Export-ScheduledTask -TaskName $taskName -TaskPath '\' | Set-Content -LiteralPath (Join-Path $taskCache 'autostart-task.xml') -Encoding Unicode
    Start-ScheduledTask -TaskName $taskName -TaskPath '\'
    @{ installed = $true; taskName = $taskName; runAsUser = $RunAsUser; installedAt = (Get-Date).ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $taskStatusFile -Encoding UTF8
    Write-Output 'Avvio automatico Staiano HVAC installato e avviato.'
} catch {
    @{ installed = $false; error = $_.Exception.Message; attemptedAt = (Get-Date).ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $taskStatusFile -Encoding UTF8
    Write-Error $_
    exit 1
}
