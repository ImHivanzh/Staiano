# Pacchetti Windows da GitLab

Repository canonico: [imhivanzh/Staiano3D](https://gitlab.com/imhivanzh/Staiano3D), progetto ID `87880568`, sottocartella `STAIANO-3D/`.

`compila.bat` collauda e pubblica l’EXE nel Generic Package Registry (`staiano-hvac/<commit>/StaianoHVAC.exe`), crea la release `exe-<commit>` con il collegamento al pacchetto e registra hash e dimensione nel Worker. I tentativi ripetuti conservano il binario già caricato. Non vengono eliminate release o versioni precedenti.

Richiede Node 24.14.0 su Windows x64, albero pulito, `origin/main` allineato, accesso GitLab via Git Credential Manager oppure `GITLAB_TOKEN` (scope `api`), e `LICENSE_PUBLISH_TOKEN` locale corrispondente a `PUBLISH_TOKEN` del Worker.

Il Worker usa un deploy token del solo progetto con `read_repository` e `read_package_registry`: `GITLAB_READ_USERNAME` e `GITLAB_READ_TOKEN` nei segreti Cloudflare. Verifica `main` tramite Git smart HTTP e scarica soltanto dal percorso pacchetto del progetto previsto. Firma, autorizzazione licenza, numero di sequenza e URL client del Worker restano invariati. Le credenziali non vengono incluse nell’EXE. Il token creato il 21 ottobre 2026 scade il 20 ottobre 2027; va sostituito prima della scadenza. `scripts/configure-update-access.mjs` trasferisce una nuova coppia di credenziali al Worker senza salvarla localmente.

`windows-release.yml` è un template GitLab CI facoltativo, non attivato: richiede un runner Windows con Node 24.14.0 e gli strumenti nativi della build, oltre alle variabili protette `GITLAB_TOKEN` e `LICENSE_PUBLISH_TOKEN`. Includerlo da `.gitlab-ci.yml` solo dopo aver configurato il runner. La pubblicazione ordinaria resta locale con `compila.bat`.
