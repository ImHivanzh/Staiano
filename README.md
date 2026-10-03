# Staiano HVAC

Configuratore HVAC locale per Termoidraulica Staiano. Node.js >=22.13 (verificato con 24.14).

```powershell
npm ci
npm run dev
```

Aprire http://127.0.0.1:3015. Per avvio produzione: `npm run build`, poi `npm start`.
`avvia.bat` avvia il server locale senza download quando le dipendenze sono installate.

```powershell
npm run typecheck
npm run lint
npm test
npm run test:e2e
```

Creare progetto, scegliere disegno manuale, inserire stanza con misure nette o
chiudere un contorno di muri. Altezza suggerita esplicita: 2,70 m, modificabile.
I progetti sono nel browser (IndexedDB): esportare `.hvacproj` per il backup
portabile. Cancellare i dati del browser cancella l'archivio locale.

Architettura e limiti in ARCHITECTURE.md; stato milestone in ROADMAP.md.

Impianti split/mono/multi e canalizzati Daikin, Mitsubishi e Gree; radiatori
Cordivari/Global; terminali Ecoclima con gallery e dati originali. Formule,
revisioni e controlli separati consultabili. Dossier PDF dalla toolbar;
esempio reale in `output/pdf`.

Il wizard importa DWG/DXF/PDF/immagini con scelta layer, assi e calibrazione.
DWG usa il parser locale MIT; versioni o proxy non supportati richiedono
esportazione DXF ASCII o disegno manuale. Formati, sicurezza e limiti in
`docs/PLAN_IMPORT.md` e `docs/DWG.md`.

In `Cataloghi tecnici`: 18 modelli Ardesia ufficiali convertiti in GLB locale.
Hash e fonti registrati; quote mesh discordanti esplicite, escluse dalla posa
verificata. Verificare diritti prima della redistribuzione pubblica degli asset.

Comandi manutenzione: `catalog:update:cordivari`, `catalog:update:global`,
`catalog:update:ecoclima`, `catalog:update:hvac`, `catalog:update:split`.
Producono staging/report; `--apply` salva dopo revisione delle differenze.
Fonti riacquisibili con gli script separati in `scripts/catalog-import`.
Python non serve al runtime. Worker PDF locale sincronizzato da `postinstall`.
Test browser con Edge (`channel: msedge`); adattare Playwright per altri browser.

HTTPS interno pronto: https://hvac.internal.staianopoint.com . Caddy usa il
wildcard Let’s Encrypt esistente e ne mantiene il rinnovo automatico. Avvio
produzione senza finestra: avvia-produzione.bat . Dettagli deploy/caddy/README.md.

DWG nativo: parser MIT ACadSharp 3.8.0 con .NET 8 o superiore sul server, runtime
distribuito e hash/notice conservati. Ricompilazione: `npm run dwg:build`. ODA commerciale resta
disattivato. Per formati/proxy non leggibili il wizard suggerisce DXF/manuale.

Radiatori: ricerca esatta di potenza minima compatibile con i vincoli, anche
fra famiglie quando non bloccate. Il worker continua fino alla prova completa
oppure all’annullamento esplicito; nessun risultato provvisorio applicabile.
Le combinazioni complesse possono richiedere tempo. Marca/famiglia libere;
quantità opzionale con default 1 esplicito, dati salvati ripristinati al reload.
