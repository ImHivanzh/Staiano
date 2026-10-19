# HTTPS interno Staiano HVAC

Indirizzo: https://hvac.internal.staianopoint.com

Il DNS wildcard interno risolve a192.168.178.9. Caddy2.11.4 esistente usa il
certificato Let’s Encrypt per `*.internal.staianopoint.com`, con rinnovo automatico
DNS-01. Non occorre un nuovo certificato separato o installare una CA sui client.

Il Caddyfile principale in `C:/local-software/moduli/https/Caddyfile` importa
`C:/local-software/moduli/https/staiano-hvac.caddy` dentro il blocco wildcard.
Il frammento aggiunge solo la route HVAC verso 127.0.0.1:3015.

Il frammento è stato spostato fuori da questo repository il 18/10/2026: il repo
è una copia di sviluppo e sulla macchina in esercizio viene eliminato, quindi
Caddy non deve dipendere da un file al suo interno. `deploy/caddy/hvac.caddy`
resta qui come originale da ricopiare quando si reinstalla la postazione.
Backup del Caddyfile principale prima dello spostamento:
`Caddyfile.backup-before-hvac-import-move-20261018-183807` (più il precedente
`Caddyfile.backup-before-hvac-20261003-130415`).

La modifica runtime è stata applicata all’API locale Caddy con ETag e inserimento
di una sola route:9→10. Non sono stati letti né modificati i token Cloudflare
protetti da ACL. Le policy TLS e le altre route restano quelle esistenti.
Il file proposto è conservato per review; non contiene token o chiavi private.

Verifica TLS con SslStream standard, senza ignorare errori:

- Subject/SAN: `*.internal.staianopoint.com`.
- Issuer: Let’s Encrypt YE1.
- Scadenza osservata:2026-12-04T09:34:42+01:00.
- SHA1thumbprint pubblica:0C4560097AC0AC71C057FF151102A2032BFAB02D.
- Home e logo viaHTTPS:200; HSTS1anno ereditato dalla configurazione interna.

Per avviare il software: `npm run build`, poi `avvia-produzione.bat` oppure
`deploy/start-production.ps1`. Il server ascolta solo su127.0.0.1:3015 e viene
avviato senza finestra; log/PID/buildID in `.cache`, esclusa da Git.
`npm run dev` resta disponibile per sviluppo; non avviare due processi sulla
stessa porta. Il certificato e la route Caddy non dipendono da una console Node
aperta, ma il server app deve essere attivo per rispondere.

L'avvio automatico Windows dell'applicazione usa l'attività `Staiano HVAC`:
avvio del computer con ritardo di 15 secondi, anche senza login, account locale
`Daniele` con privilegi limitati e accesso S4U senza password memorizzata.
Il processo viene sorvegliato; in caso di uscita l'attività riparte dopo un minuto
(fino a 999 tentativi). Caddy mantiene il proprio avvio esistente.

Installazione, dopo `npm run build`, da PowerShell come amministratore:

```powershell
.\deploy\install-autostart.ps1 -RunAsUser 'SERVER-STAIANOP\Daniele' -NodePath 'C:\nvm4w\nodejs\node.exe'
```

L'attività usa un percorso Node esplicito e non richiede una console aperta.
Con S4U può accedere ai file locali, ma non a condivisioni di rete o file EFS.
Per altre macchine adattare account e percorso Node. Configurazione e risultato
dell'installazione sono in `.cache/autostart-task.xml` e
`.cache/autostart-install.json`; log dell'applicazione in `.cache/server.*.log`.
`avvia-produzione.bat` resta disponibile per l'avvio manuale e riconosce un server
già attivo senza avviare un secondo processo.

Gestione da PowerShell come amministratore:

```powershell
Get-ScheduledTask -TaskName 'Staiano HVAC'
Get-ScheduledTaskInfo -TaskName 'Staiano HVAC'
Stop-ScheduledTask -TaskName 'Staiano HVAC'
Start-ScheduledTask -TaskName 'Staiano HVAC'
```

Per aggiornare la produzione: arrestare l'attività, verificare che la porta 3015
sia libera, aggiornare il repository, eseguire `npm run build` e riavviare
l'attività. Non ricompilare `.next` mentre il server di produzione la usa.
Per disattivare l'avvio automatico: `Disable-ScheduledTask -TaskName 'Staiano HVAC'`.
Per rimuoverlo: arrestare l'attività, poi
`Unregister-ScheduledTask -TaskName 'Staiano HVAC' -Confirm:$false`.

Il browser separa gli archivi IndexedDB per origine: per spostare progetti da
127.0.0.1 al dominioHTTPS usare l’export/import `.hvacproj` già disponibile.
