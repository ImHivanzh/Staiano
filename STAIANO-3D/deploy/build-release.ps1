# Compila il pacchetto EXE di Staiano HVAC e lo pubblica sul canale aggiornamenti.
#
#   compila.bat                 compila, collauda e pubblica
#   compila.bat installa        come sopra e installa il pacchetto su questa postazione
#   compila.bat notest          salta la suite di test
#   compila.bat nopublish       compila e collauda senza pubblicare
#
# Richiede: Node 24.14.0 su Windows x64, albero di lavoro pulito e HEAD uguale a
# origin/main su GitLab. I segreti GITLAB_TOKEN e
# LICENSE_PUBLISH_TOKEN si leggono da .env.local (escluso dal repository).
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $Flags = @()
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
# Se le credenziali Git sono scadute, Git Credential Manager deve poterle chiedere.
$env:GCM_INTERACTIVE = 'always'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$install = $Flags -contains 'installa'
$skipTests = $Flags -contains 'notest'
$skipPublish = $Flags -contains 'nopublish'
$expectedNode = 'v24.14.0'

function Write-Step([string] $title) {
  Write-Host ''
  Write-Host "== $title ==" -ForegroundColor Cyan
}

function Write-Fail([string] $message) {
  Write-Host ''
  Write-Host "ERRORE: $message" -ForegroundColor Red
  exit 1
}

function Invoke-Native([string] $file, [string[]] $arguments) {
  & $file @arguments
  if ($LASTEXITCODE -ne 0) {
    Write-Fail "comando non riuscito ($file $($arguments -join ' ')), codice $LASTEXITCODE."
  }
}

$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) { Write-Fail 'Node.js non trovato nel PATH.' }
$npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $npm) { Write-Fail 'npm non trovato nel PATH.' }
$git = (Get-Command git.exe -ErrorAction SilentlyContinue).Source
if (-not $git) { Write-Fail 'Git non trovato nel PATH.' }

Write-Host 'Staiano HVAC - compilazione e pubblicazione del pacchetto' -ForegroundColor White
Write-Host "Cartella: $root"

# 1. Versione di Node: la build produce un SEA e richiede esattamente questa.
Write-Step 'Versione di Node'
$version = (& $node -v).Trim()
if ($version -ne $expectedNode) {
  Write-Fail "serve Node $expectedNode (trovato $version)."
}
Write-Host "$version ok"

# 2. L'albero deve essere pulito: le build con modifiche non committate non si pubblicano.
Write-Step 'Stato del repository'
$dirty = @(& $git status --porcelain)
if ($dirty.Count -gt 0) {
  Write-Host ($dirty -join "`n")
  Write-Fail 'ci sono modifiche non committate: committa o fai stash, poi riprova.'
}
Write-Host 'albero pulito'

# 2b. Il manifest dei documenti tecnici deve corrispondere ai cataloghi generati.
Write-Step 'Manifest dei documenti tecnici'
Invoke-Native $node @('scripts/catalog-sources.mjs', 'check')

# 3. Il pacchetto deve corrispondere al ramo main pubblicato: allinea e, se serve, pubblica i commit.
Write-Step 'Allineamento sorgente e canale EXE GitLab'
$head = (& $git rev-parse HEAD).Trim()
foreach ($releaseRemote in @('origin')) {
  Invoke-Native $git @('fetch', $releaseRemote, 'main')
  $remote = (& $git rev-parse "$releaseRemote/main").Trim()
  if ($head -ne $remote) {
    & $git merge-base --is-ancestor "$releaseRemote/main" HEAD
    if ($LASTEXITCODE -ne 0) {
      Write-Fail "main locale e $releaseRemote/main sono divergenti: allinea il ramo e riprova."
    }
    $pending = @(& $git log --oneline "$remote..$head")
    Write-Host "commit da pubblicare su $($releaseRemote): $($pending.Count)"
    Invoke-Native $git @('push', $releaseRemote, 'main')
  }
}
Write-Host "revisione $($head.Substring(0, 12)) allineata"

# 4. Dipendenze.
if (-not (Test-Path (Join-Path $root 'node_modules'))) {
  Write-Step 'Installazione delle dipendenze'
  Invoke-Native $npm @('ci')
}

# 5. Test.
if ($skipTests) {
  Write-Step 'Test'
  Write-Host 'saltati (notest)'
} else {
  Write-Step 'Test'
  Invoke-Native $npm @('test')
}

# 6. Compilazione del pacchetto.
Write-Step 'Compilazione del pacchetto'
$buildDirectory = $env:STAIANO_BUILD_DIR
if (-not $buildDirectory) { $buildDirectory = if ((Test-Path '.cache/production-server.json') -and ((Get-Content '.cache/production-server.json' -Raw | ConvertFrom-Json).buildDirectory -eq '.next-update')) { '.next' } else { '.next-update' } }
$env:STAIANO_BUILD_DIR = $buildDirectory
Write-Host "directory di build: $buildDirectory"
Invoke-Native $npm @('run', 'exe:build')

$releaseFile = Join-Path $root 'dist-exe\release.json'
$release = Get-Content -LiteralPath $releaseFile -Raw | ConvertFrom-Json
if ($release.dirty) {
  Write-Fail 'il pacchetto risulta compilato da un albero con modifiche: non va pubblicato.'
}
if ($release.commit -ne $head) {
  Write-Fail "il pacchetto appartiene alla revisione $($release.commit), non a $head."
}

# 7. Collaudo del pacchetto.
Write-Step 'Collaudo del pacchetto'
$exe = Join-Path $root 'dist-exe\StaianoHVAC.exe'
$probe = Join-Path $env:TEMP 'staiano-release-check'
New-Item -ItemType Directory -Path $probe -Force | Out-Null
$reported = (& $exe --version --data-dir $probe | Select-Object -Last 1).Trim()
if ($LASTEXITCODE -ne 0) {
  Write-Fail "l'EXE non si avvia (codice $LASTEXITCODE)."
}
if ($reported -ne $release.buildId) {
  Write-Fail "l'EXE riporta la build $reported invece di $($release.buildId)."
}
Write-Host "build $($release.buildId) verificata"

# 8. Pubblicazione: release immutabile GitLab + registrazione sul Worker.
if ($skipPublish) {
  Write-Step 'Pubblicazione'
  Write-Host 'saltata (nopublish)'
} else {
  Write-Step 'Pubblicazione'
  Invoke-Native $node @('scripts/publish-executable.mjs')
}

# 9. Installazione facoltativa su questa postazione.
if ($install) {
  Write-Step 'Installazione su questa postazione'
  Invoke-Native $npm @('run', 'exe:install')
}

Write-Host ''
Write-Host "Pacchetto $($release.buildId) pronto ($([Math]::Round($release.size / 1MB, 1)) MB, revisione $($release.commit.Substring(0, 12)))." -ForegroundColor Green
if (-not $install) {
  Write-Host 'Esegui compila.bat installa per installarlo su questa postazione.'
}
exit 0
