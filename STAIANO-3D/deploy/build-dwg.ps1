$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$env:DOTNET_CLI_HOME = Join-Path $taskRoot '.cache/dotnet'
$env:NUGET_PACKAGES = Join-Path $taskRoot '.cache/nuget'
# Il lock globale in %TEMP%\NuGetScratch può essere inaccessibile a un token
# ristretto: il restore usa una cartella locale al progetto.
$env:NUGET_SCRATCH = Join-Path $taskRoot '.cache/nuget-scratch'
# Anche MSBuild scrive file temporanei: senza una cartella scrivibile il
# publish fallisce con accesso negato sui file .rsp.
$env:TEMP = Join-Path $taskRoot '.cache/build-temp'
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Path $env:TEMP -Force | Out-Null
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$env:DOTNET_GENERATE_ASPNET_CERTIFICATE = 'false'
$taskLocalSdk = Join-Path $taskRoot '.cache/dotnet-sdk/dotnet.exe'
$taskDotnet = if (Test-Path -LiteralPath $taskLocalSdk) { $taskLocalSdk } else { (Get-Command dotnet -ErrorAction Stop).Source }
Push-Location $taskRoot
try {
    & $taskDotnet restore native/DwgBridge/DwgBridge.csproj --locked-mode --source https://api.nuget.org/v3/index.json --nologo
    if ($LASTEXITCODE -ne 0) { throw 'Restore del lettore DWG non riuscito.' }
    & $taskDotnet publish native/DwgBridge/DwgBridge.csproj -c Release -o native/runtime --no-restore --nologo -p:ContinuousIntegrationBuild=true
    if ($LASTEXITCODE -ne 0) { throw 'Build del lettore DWG non riuscita.' }
    & $taskDotnet publish native/SketchUpBridge/SketchUpBridge.csproj -c Release -o native/runtime --nologo -p:ContinuousIntegrationBuild=true
    if ($LASTEXITCODE -ne 0) { throw 'Build del bridge SketchUp non riuscita.' }
    Copy-Item -LiteralPath 'native/notices/ACadSharp-MIT.txt' -Destination 'native/runtime/ACadSharp-MIT.txt'
    Write-Output 'Bridge DWG MIT compilato. Nessuna attivazione ODA commerciale.'
} finally { Pop-Location }
