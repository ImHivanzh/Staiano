# HTTPS interno Staiano HVAC

Indirizzo: https://hvac.internal.staianopoint.com

Il DNS wildcard interno risolve a192.168.178.9. Caddy2.11.4 esistente usa il
certificato Let’s Encrypt per `*.internal.staianopoint.com`, con rinnovo automatico
DNS-01. Non occorre un nuovo certificato separato o installare una CA sui client.

Il Caddyfile principale in `C:/local-software/moduli/https/Caddyfile` importa
`C:/local-software/staiano-3d/deploy/caddy/hvac.caddy` dentro il blocco wildcard.
Il frammento aggiunge solo la route HVAC verso127.0.0.1:3015.

Backup del file principale:
`Caddyfile.backup-before-hvac-20261003-130415` nella stessa directory HTTPS.

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

Nessun avvio automatico Windows aggiunto. Caddy mantiene il proprio avvio esistente.
Il browser separa gli archivi IndexedDB per origine: per spostare progetti da
127.0.0.1 al dominioHTTPS usare l’export/import `.hvacproj` già disponibile.
