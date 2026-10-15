<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Aggiornamenti

- Dopo ogni aggiornamento, ricompilare e riavviare il server Staiano. Verificare che risponda con la nuova build prima di dichiarare il lavoro completato.
- Il server è gestito dall’attività Windows «Staiano HVAC». Dopo la build, riavviare l’attività con `schtasks /End /TN "Staiano HVAC"` e `schtasks /Run /TN "Staiano HVAC"`. Verificare `.cache/production-server.json` e la risposta HTTP sulla porta 3015. Compilare nella directory alternativa a quella attiva (`.next` o `.next-update`) per preservare gli asset durante la compilazione.
- Attendere che l’attività risulti `Ready` dopo l’arresto. Se `/Run` non aggiorna l’ultima esecuzione, usare `Start-ScheduledTask -TaskName 'Staiano HVAC'` e verificare nuovamente PID e build. Non serve registrare nuovamente l’attività.
