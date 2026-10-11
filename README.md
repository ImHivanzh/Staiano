# Staiano HVAC

Per presentare il progetto sulla TV collegata al PC, usare **Apri vista cliente**
nella barra della vista. Spostare la nuova finestra sullo schermo TV e premere
**Schermo intero**. Le modifiche e gli annullamenti nel configuratore aggiornano
il modello automaticamente; la finestra cliente non salva né modifica il progetto.
La sincronizzazione funziona fra finestre dello stesso browser e computer.

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
Il solo riavvio serve la build già presente: dopo modifiche al codice ricompilare.
L'avvio segnala una build precedente ai sorgenti e riavvia il processo Staiano
verificato quando trova una nuova build.
Per compilare senza toccare la versione attiva, impostare
`$env:STAIANO_BUILD_DIR='.next-update'` prima di `npm run build`.
L'avvio sceglie la build completa più recente tra `.next` e `.next-update`.
Avvio automatico Windows: attività `Staiano HVAC` all'avvio del computer,
anche senza login, con riavvio su errore. Installazione e gestione:
`deploy/caddy/README.md`.

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

L’archivio permette di cercare i progetti per nome e ordinarli. I controlli
si filtrano per esito, piano e ambiente, con errori e avvisi prima degli esiti
validi. Dal listino materiali è disponibile la distinta CSV per Excel;
quantità e prezzi mancanti restano espliciti, senza essere sostituiti da zero.
Il pulsante **Esporta Excel per Easyfatt** genera un file `.xlsx`: il foglio
**Righe preventivo** contiene codici testuali, quantità e prezzi numerici;
**Da completare** raccoglie le voci non ancora importabili. Nel preventivo
Easyfatt preparare il modello vuoto da Utilità > Importa righe da Excel,
copiare i dati nelle colonne corrispondenti mantenendo le intestazioni del
modello, quindi salvare e importare. IVA e codici articolo vanno verificati.
I percorsi automatici di canali e tubazioni restano nel perimetro del piano,
con il solo collegamento esterno della pompa. I percorsi manuali restano salvati.
Nelle proprietà della pompa, **Rivolgi ventilatore all’esterno** corregge
l’orientamento anche dei progetti esistenti senza spostare la macchina.
Selezionando la pompa in 3D, le frecce di spostamento sono subito disponibili.
**Vista ventilatore** inquadra il fronte; **Inverti verso (180°)** ne cambia il verso.
I dati della macchina restano nelle proprietà, senza etichette sovrapposte al modello.
La vista canali mostra i percorsi; **Configura percorsi** apre una scheda compatta
con gli impianti richiudibili. L’interfaccia viene verificata su PC 1920×1080 e iPad.
Se un’altra scheda modifica o elimina il progetto, il salvataggio concorrente
viene bloccato: è possibile conservare una copia delle modifiche locali oppure
caricare la versione nell’archivio. Non viene effettuata una fusione automatica.

Nel menu File, **Impostazioni progetto e piani** gestisce altezza e spessori dei
nuovi elementi, nomi e ordine dei piani. Le quote verticali e gli identificativi
restano indipendenti dall’ordine. I campi dimensionali permettono di scegliere
metri, centimetri o millimetri, salvando le misure nelle unità del modello.

Nelle proprietà stanza è possibile dichiarare un ambiente non climatizzato,
con motivo obbligatorio. Superficie, volume e apparecchi restano conservati;
il fabbisogno da dimensionare diventa zero. Apparecchi ancora associati producono
un avviso. La scelta e il motivo compaiono nei controlli e nel dossier.
La ricalibrazione mostra un’anteprima di superficie, carico e nuove anomalie;
la modifica viene applicata solo dopo conferma. **Anteprima PDF** visualizza le
pagine nell’app e permette di scaricare lo stesso documento già generato.

Il formato corrente è v5. I progetti v0–v4 vengono importati automaticamente;
gli esistenti vengono riscritti al successivo salvataggio. Le versioni precedenti
dell’app non aprono i file v5, evitando di perdere la separazione degli impianti.
Conservare un export originale prima del passaggio se serve un ritorno alla
versione precedente. Riaprire le schede dopo l’aggiornamento dell’app.
Il wizard aggiunge un impianto per volta: nome, tipo e stanze sono indipendenti.
La stessa stanza può appartenere a impianti distinti, mostrati insieme nella vista
complessiva. EDLS, EDFL ed EDSC-C sono le scelte principali per le bocchette;
il resto del catalogo rimane disponibile.

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
