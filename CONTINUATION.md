# Checkpoint di rilascio

Rilascio verificato il 3 ottobre 2026: 129 unit test su 20 file, 18 E2E Edge su HTTPS,
TypeScript strict, lint e build superati. Audit npm runtime: zero vulnerabilità.
NuGet non segnala vulnerabilità. Prove in VERIFICATION.md e output/verification;
matrice dell'intero brief in docs/REQUIREMENTS-AUDIT.md.

URL: https://hvac.internal.staianopoint.com. Build in produzione:
`rIJ9Q0cKcLKDrGOZ5lOKh`. Prima di riavviare consultare
`.cache/production-server.json` e verificare PID, comando e listener.
Il certificato wildcard Let's Encrypt esistente copre il dominio; Caddy mantiene
il rinnovo DNS-01. Le nove route precedenti sono preservate. L'import HVAC è
persistito nel Caddyfile globale con backup. Il token Cloudflare protetto da ACL
non è stato letto o modificato.

Cataloghi: 154 radiatori, 160 terminali con 534 punti e 16 punti in quarantena,
21 abbinamenti canalizzati, 24 split con 2403 combinazioni approvate. Nove pagine
commerciali restano separate dai calcoli. Fonti originali e storico per istanza.
I 18 GLB Cordivari sono disponibili in anteprima: l'incongruenza di larghezza
di 9,2 mm è dichiarata e impedisce la posa verificata della mesh.
Il PDF reale contiene 11 pagine; nominali e ingombri sono distinti.
Nessun carattere fuori pagina. Licenza Inter OFL inclusa.

Radiatori: ricerca completa, rappresentazione esatta dei decimali nominali e
ricerca completa ad altri ΔT. Nessun limite automatico di stati; worker con
progresso e annullamento. L'applicazione richiede la prova di ottimalità.
Marca e famiglia libere consentono combinazioni miste; ogni unità conserva
fonte e revisione.

DWG nativo: ACadSharp 3.8.0 MIT con .NET 8 o superiore. Binario reale, API,
wizard e persistenza verificati. ODA commerciale disattivato.
Runtime, notice e hash inclusi.

Schema v2: campi legacy sconosciuti conservati, contorni aperti preservati e
dimensionamento bloccato, snap, quote, adiacenza, divisione/unione, piani,
copia/spostamento/undo, ricalibrazione e collisioni in pianta e quota verticale.
Nessuna AI/OCR, login o prezzo nel calcolo. Dati mancanti ed errori espliciti.

Tooling Windows: il helper predefinito non funziona; le esecuzioni approvate con
`require_escalated` funzionano. Non aggirare il controllo automatico. Dopo un
timeout è ammesso un solo retry. Edge Playwright verifica TLS senza bypass.
Python bundled dispone di pdfplumber e Pillow. Usare Git safe.directory per
comando e limitare gli output. Consultare le guide Next in
node_modules/next/dist/docs prima di modifiche al framework.
Non redistribuire pubblicamente asset produttore senza verificare i diritti.
