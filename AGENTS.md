<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Aggiornamenti

- Dopo ogni aggiornamento, ricompilare e riavviare il server Staiano. Verificare che risponda con la nuova build prima di dichiarare il lavoro completato.
- Il server è gestito dall’attività Windows «Staiano HVAC». Dopo la build, riavviare l’attività con `schtasks /End /TN "Staiano HVAC"` e `schtasks /Run /TN "Staiano HVAC"`. Verificare `.cache/production-server.json` e la risposta HTTP sulla porta 3015. Compilare nella directory alternativa a quella attiva (`.next` o `.next-update`) per preservare gli asset durante la compilazione.
- Attendere che l’attività risulti `Ready` dopo l’arresto. Se `/Run` non aggiorna l’ultima esecuzione, usare `Start-ScheduledTask -TaskName 'Staiano HVAC'` e verificare nuovamente PID e build. Non serve registrare nuovamente l’attività.

## Licenza

- Il controllo è **attivo** su questa postazione: `LICENSE_ENFORCE=1` in `.env.local` (gitignorato), insieme a `LICENSE_SERVER_URL`, `LICENSE_ADMIN_TOKEN` e `LICENSE_PUBLIC_KEY_FILE`. Senza il flag l’app si comporta come prima e la sezione _Licenza_ resta solo informativa.
- Il server è il Worker Cloudflare **https://licenses.ivanbuonocore.dev** (codice in `license-server/`, dati in D1 `licenses`); chiavi e token stanno in `.cache/`, la chiave privata vive solo come segreto del Worker.
- `deploy/start-production.ps1` riavvia il processo solo se la build è più recente del processo in ascolto: dopo una modifica alle sole variabili d’ambiente occorre ricompilare nella directory alternativa (o usare `deploy/update-project.ps1 -SkipPull`, che però esegue anche `npm ci` e richiede privilegi elevati).
