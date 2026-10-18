$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$env:DOTNET_CLI_HOME = Join-Path $taskRoot '.cache/dotnet'
$env:NUGET_PACKAGES = Join-Path $taskRoot '.cache/nuget'
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$env:DOTNET_GENERATE_ASPNET_CERTIFICATE = 'false'
$taskDotnet = (Get-Command dotnet -ErrorAction Stop).Source
Push-Location $taskRoot
try {
    & $taskDotnet restore native/DwgBridge/DwgBridge.csproj --locked-mode --nologo
    if ($LASTEXITCODE -ne 0) { throw 'Restore del lettore DWG non riuscito.' }
    & $taskDotnet publish native/DwgBridge/DwgBridge.csproj -c Release -o native/runtime --no-restore --nologo -p:ContinuousIntegrationBuild=true
    if ($LASTEXITCODE -ne 0) { throw 'Build del lettore DWG non riuscita.' }
    Copy-Item -LiteralPath 'native/notices/ACadSharp-MIT.txt' -Destination 'native/runtime/ACadSharp-MIT.txt'
    Write-Output 'Bridge DWG MIT compilato. Nessuna attivazione ODA commerciale.'
} finally { Pop-Location }
