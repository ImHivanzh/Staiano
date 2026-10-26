param([Parameter(Mandatory=$true)][string]$Python)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskPython = (Get-Command $Python).Source
$taskVersion = & $taskPython -c 'import sys; print("%d.%d" % sys.version_info[:2])'
if ($taskVersion -ne '3.12') { throw 'Il riconoscitore richiede Python 3.12.' }
$taskCache = Join-Path $taskRoot '.cache\floorplan-ai'
New-Item -ItemType Directory -Path $taskCache -Force | Out-Null
function Get-VerifiedAsset([string]$Url, [string]$File, [string]$Sha256) {
    if (-not (Test-Path -LiteralPath $File)) { Invoke-WebRequest -Uri $Url -OutFile $File }
    if ((Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash -ne $Sha256) { throw ('Hash non valido: ' + $File) }
}
$taskArchive = Join-Path $taskCache 'official.zip'
Get-VerifiedAsset 'https://codeload.github.com/Cornell-VAILab/Raster2Seq/zip/a6c4e27a68d11d7a459f6e4a2601fd887227dd1a' $taskArchive 'DB85D416BEF1379AB2CAE3969EBB8DB4C2524FCC01C69D15F961098AECF3C672'
$taskSource = Join-Path $taskCache 'official'
if (-not (Test-Path -LiteralPath (Join-Path $taskSource '.source-revision'))) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    New-Item -ItemType Directory -Path $taskSource -Force | Out-Null
    $taskZip = [IO.Compression.ZipFile]::OpenRead($taskArchive)
    try {
        foreach ($taskEntry in $taskZip.Entries) {
            $taskRelative = ($taskEntry.FullName -split '/', 2)[1]
            if (-not $taskRelative) { continue }
            $taskTarget = [IO.Path]::GetFullPath((Join-Path $taskSource $taskRelative))
            if (-not $taskTarget.StartsWith(([IO.Path]::GetFullPath($taskSource) + [IO.Path]::DirectorySeparatorChar), [StringComparison]::OrdinalIgnoreCase)) { throw 'Percorso archivio non valido.' }
            if ($taskEntry.FullName.EndsWith('/')) { New-Item -ItemType Directory -Path $taskTarget -Force | Out-Null; continue }
            New-Item -ItemType Directory -Path (Split-Path -Parent $taskTarget) -Force | Out-Null
            [IO.Compression.ZipFileExtensions]::ExtractToFile($taskEntry, $taskTarget, $true)
        }
        'a6c4e27a68d11d7a459f6e4a2601fd887227dd1a' | Set-Content -LiteralPath (Join-Path $taskSource '.source-revision')
    } finally { $taskZip.Dispose() }
}
$taskWeights = Join-Path $taskCache 'models\raster2seq\cubicasa5k\checkpoint.pth'
New-Item -ItemType Directory -Path (Split-Path -Parent $taskWeights) -Force | Out-Null
Get-VerifiedAsset 'https://huggingface.co/haopt/Raster2Seq/resolve/c9a9c439ba66594dab701b77b7df52a5f75a5fce/cubicasa5k/checkpoint.pth' $taskWeights 'F7C0EF9379AA8CF11349DA8B2179214E0D495AF758383984A2361A1309AAB3B7'
$taskVenv = Join-Path $taskCache 'venv'
if (-not (Test-Path -LiteralPath (Join-Path $taskVenv 'Scripts\python.exe'))) {
    & $taskPython -m venv $taskVenv
    if ($LASTEXITCODE -ne 0) { throw 'Creazione ambiente AI non riuscita.' }
}
$taskExecutable = Join-Path $taskVenv 'Scripts\python.exe'
$taskPreviousTemp = $env:TEMP
$taskPreviousTmp = $env:TMP
$taskTemporary = Join-Path $taskCache 'temp'
New-Item -ItemType Directory -Path $taskTemporary -Force | Out-Null
try {
    $env:TEMP = $taskTemporary
    $env:TMP = $taskTemporary
& $taskExecutable -m pip install --no-deps torch==2.8.0 torchvision==0.23.0 --index-url https://download.pytorch.org/whl/cu126 --disable-pip-version-check
if ($LASTEXITCODE -ne 0) { throw 'Installazione PyTorch non riuscita.' }
& $taskExecutable -m pip install -r (Join-Path $taskRoot 'native\PlanRecognizer\requirements.txt') --index-url https://pypi.org/simple --disable-pip-version-check
if ($LASTEXITCODE -ne 0) { throw 'Installazione dipendenze AI non riuscita.' }
} finally {
    $env:TEMP = $taskPreviousTemp
    $env:TMP = $taskPreviousTmp
}
$taskRuntime = Join-Path $taskRoot 'native\runtime'
New-Item -ItemType Directory -Path $taskRuntime -Force | Out-Null
$taskConfig = @{python=$taskExecutable;source=$taskSource;checkpoint=$taskWeights} | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $taskRuntime 'plan-ai.json'), $taskConfig, [Text.UTF8Encoding]::new($false))
Write-Output 'Ricostruzione 2D locale configurata. In Importa planimetria aprire Stato AI e premere Verifica AI. Non occorre ricompilare.'
