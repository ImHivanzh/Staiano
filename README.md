# Staiano HVAC

Configuratore HVAC locale per Termoidraulica Staiano.

Accesso interno: <https://hvac.internal.staianopoint.com>. Il login richiede
la password amministrativa impostata sul server. Progetti e cataloghi restano
sul dispositivo; non è richiesto un account cloud.

## Avvio

Node.js >=22.13 (verificato con 24.14):

```powershell
npm ci
npm run dev
```

La prima configurazione dell'accesso sul computer che esegue Next:
`node scripts/configure-access.mjs --stdin`. Il prompt nasconde l'input; il file
privato `.cache/app-auth.json` contiene solo hash scrypt e chiave di sessione.
Cambio password con `--stdin --rotate`; revoca delle sole sessioni con
`--rotate-session-only`. Non passare la password come argomento o variabile shell.
Per avvio produzione: `npm run build`, poi `avvia-produzione.bat`.

## Progettazione

Nuovo progetto, stanza manuale con misure reali, oppure importazione DXF/PDF/immagini/DWG.
Nel 3D: Radiatori, Climatizzatori, Bocchette, Macchina manuale e Plenum.
Scegli una stanza, un modello reale e inserisci l'apparecchio in pochi passaggi.
L'inspector mostra le proprietà tecniche quando le apri; orbit, sezione,
materiali, immagini render e modelli 3D ufficiali sono disponibili nel viewer.

I radiatori includono 466 modelli Cordivari, Global, Zehnder e Lazzarini,
con foto e finiture documentate. Corpi, valvole, detentori e copritubi hanno
selettori distinti secondo le palette ufficiali del modello.

I terminali Ecoclima raccolgono 127 famiglie, 1778 varianti e 6788 punti
originali. Le immagini locali mostrano il profilo scelto. I dati incompleti
restano espliciti e non entrano nelle raccomandazioni automatiche.
Il configuratore ripartisce la portata massima dichiarata tra gli ambienti,
mostra i metri lineari e permette di scegliere anche le griglie di ripresa.

Ogni sistema canalizzato conserva macchina, ambienti e bocchette indipendenti.
La vista plenum mostra l'attacco della macchina selezionata, le connessioni
prescritte dalle schede Ecoclima e le dimensioni di progetto. Il corpo del
plenum su misura non equivale a un accessorio OEM. Il listino separa gli
articoli Ecoclima originali, i ponti, i kit e le righe ancora da quotare.

Il dossier PDF include viste generate dal vero modello 3D e la distinta Ecoclima.
Le finiture PBR sono illustrative. In `docs/REALISTIC-3D.md`, fonti, limiti e prove.
Cataloghi e foto ufficiali locali hanno hash e provenienza nei rispettivi manifest.
Prima della redistribuzione pubblica, verificare i diritti dei singoli asset.

I progetti sono in IndexedDB nel browser corrente. Esportare `.hvacproj` per
backup o trasferimento. Il browser separa archivi tra `127.0.0.1` e HTTPS.

## Verifica

```powershell
npm run typecheck
npm run lint
npm test
npm run test:e2e
```

Stato verificato: `VERIFICATION.md`. Architettura: `ARCHITECTURE.md`.
DWG: `docs/DWG.md`. HTTPS interno e avvio: `deploy/caddy/README.md`.
L'importatore dati produce staging/report; `--apply` salva la revisione dopo
aver controllato la differenza. Fonti riacquisibili in `scripts/catalog-import`.
Node esegue i calcoli locali e PDF. DWG nativo MIT ACadSharp richiede .NET 8+.
Ricompilazione del parser: `npm run dwg:build`. ODA commerciale disattivato.
