<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Aggiornamenti

- Dopo ogni aggiornamento, ricompilare e riavviare il server Staiano. Verificare che risponda con la nuova build prima di dichiarare il lavoro completato.
- Il server è gestito dall’attività Windows «Staiano HVAC». Dopo la build, riavviare l’attività con `schtasks /End /TN "Staiano HVAC"` e `schtasks /Run /TN "Staiano HVAC"`. Verificare `.cache/production-server.json` e la risposta HTTP sulla porta 3015. Compilare nella directory alternativa a quella attiva (`.next` o `.next-update`) per preservare gli asset durante la compilazione.
- Attendere che l’attività risulti `Ready` dopo l’arresto. Se `/Run` non aggiorna l’ultima esecuzione, usare `Start-ScheduledTask -TaskName 'Staiano HVAC'` e verificare nuovamente PID e build. Non serve registrare nuovamente l’attività.

## Documenti tecnici dei produttori

- `catalog-data/sources` (PDF, HTML, listini: oltre 1 GB) **non è in Git**: serve solo a rigenerare il catalogo e a rispondere alle schede tecniche. In Git c'è l'elenco esatto dei documenti citati, `catalog-data/sources-manifest.json` (produttore, URL di origine, SHA-256), rigenerabile con `npm run catalog:sources:list`; `compila.bat` si ferma se non è allineato ai cataloghi.
- Recupero su una postazione nuova: `npm run catalog:sources:missing` elenca gli assenti, `npm run catalog:sources:fetch` li riscarica e verifica lo SHA-256 (i documenti modificati vengono rifiutati dall'app). In alternativa si copia la cartella dalla copia di sviluppo.
- L'EXE, a ogni avvio, confronta la cartella dati con il manifest e scrive `catalog-data\ISTRUZIONI-DOCUMENTI.txt` nelle cartelle dati con i documenti mancanti, l'URL di ciascuno, il comando `robocopy` e il comando di verifica; il file sparisce quando la cartella è completa. Stato in `.cache\catalog-documents.json`. `STAIANO_CATALOG_SOURCE` in `.env.local` (trasferito dall'installer) indica l'origine da copiare.

## Licenza

- Il Worker `licenses` è universale: le licenze includono `productId`; per questa app usare `staiano-hvac`. Le chiavi `LIC-` e le storiche `STAIANO-` sono compatibili. Protocollo: `license-server/INTEGRATION.md`.
- Pubblicazione: `compila.bat` nella radice del progetto compila, collauda e pubblica il pacchetto (fa il push su GitHub se servono commit; `installa` lo installa anche qui, `nopublish` prova senza pubblicare). Richiede albero pulito, Node 24.14.0 e `GITHUB_TOKEN` + `LICENSE_PUBLISH_TOKEN` in `.env.local`. Il workflow in `deploy/ci/` resta un'alternativa non usata.
- Quando è installato, il programma gira come EXE: il record effettivo è `C:\local-software\StaianoHVAC\application\data\.cache\production-server.json`; verificare anche `X-Staiano-Build` sulla porta 3015. Il repository resta una copia di sviluppo, non è necessario al programma installato.
- Il pannello supporta passkey WebAuthn. La prima registrazione richiede accesso amministratore esistente e conferma dell'autenticatore da parte dell'utente. Non creare passkey amministrative sintetiche in produzione; usare autenticatore virtuale solo nei test locali.

- Il controllo è **attivo** su questa postazione: `LICENSE_ENFORCE=1` in `.env.local` (gitignorato), insieme a `LICENSE_SERVER_URL` e `LICENSE_PUBLIC_KEY_FILE`. Il token amministratore è stato revocato su richiesta dell'utente dopo la registrazione della passkey e rimosso dalla configurazione locale. Il pannello usa ora soltanto passkey; non ripristinare automaticamente `ADMIN_TOKEN`. Senza il flag l’app si comporta come prima e la sezione _Licenza_ resta solo informativa.
- Il server è il Worker Cloudflare **https://licenses.ivanbuonocore.dev** (codice in `license-server/`, dati in D1 `licenses`); chiavi e token stanno in `.cache/`, la chiave privata vive solo come segreto del Worker.
- `deploy/start-production.ps1` riavvia il processo solo se la build è più recente del processo in ascolto: dopo una modifica alle sole variabili d’ambiente occorre ricompilare nella directory alternativa (o usare `deploy/update-project.ps1 -SkipPull`, che però esegue anche `npm ci` e richiede privilegi elevati).

## Repository GitHub

- Repository canonico: https://github.com/ImHivanzh/Staiano, ramo `main`, progetto nella sottocartella `STAIANO-3D/`. Eseguire npm e gli script da questa sottocartella. Codeberg conserva soltanto i vecchi pacchetti.
- Pubblicazione EXE: `compila.bat`; accesso GitHub tramite Git Credential Manager oppure `GITHUB_TOKEN`. `LICENSE_PUBLISH_TOKEN` resta locale e corrisponde al segreto `PUBLISH_TOKEN` del Worker. Il server di sviluppo resta gestito da Next; il pacchetto EXE viene collaudato su una porta separata.
