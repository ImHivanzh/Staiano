# Cataloghi ufficiali locali

`sources/` conserva documenti originali e testo estratto senza OCR, AI o servizi
esterni. Manifest e discovery registrano URL, SHA256 e data UTC. Le immagini PNG
sono copie di lavoro per la verifica visiva dei disegni; non sono dati tecnici.
`generated/` contiene snapshot normalizzati validati da Zod. Il runtime non fa scraping.

## Acquisizione radiatori

Eseguire `scripts/catalog-import/acquire.py` con Python e pdfplumber, poi:

```powershell
npm run catalog:update:cordivari
npm run catalog:update:global
```

I comandi creano staging e report. Dopo aver verificato differenze e fonti,
aggiungere `-- --apply`. I prodotti rimossi richiedono `--allow-removal` e viene
conservato `.previous.json`. Codici completi mancanti sono null, senza composizione
arbitraria. Ardesia: 27 altezze per ciascuna delle 5 colonne; profondità verificate
visivamente nei disegni p.2 e ingombro con tappi L+24. Global: VIP e Oscar/Tondo
da schede tecniche originali; conteggi di batterie dal listino giugno 2026.

## Acquisizione Ecoclima

`scripts/catalog-import/ecoclima-acquire.py` individua schede dal catalogo
ufficiale pubblico. Nessun account richiesto. Nomi distinti per prodotti omonimi.
`npm run catalog:update:ecoclima` normalizza attualmente EDLS rev.03 corrente:
6 varianti, 36 operating point, misure commerciali 800/1000/1200/1500/2000 mm.
Il valore `<20` resta limite dichiarato: valore esatto null, limite superiore 20.
La tabella per 3 feritoie da 30 mm riporta 305 m³/h al primo punto nella revisione
corrente; il valore viene conservato, senza correggerlo alla precedente revisione.

I punti della tabella EDLS riguardano mandata con deflettori al 50%, lunghezza di
prova 1 m e montaggio Coanda. La ripresa non è verificabile da questi punti.
Rumore di riferimento per 1 m non equivale a rumorosità complessiva in ambiente
per una linea diversa o più apparecchi. Questa verifica resta esplicita.

Il catalogo completo include tutte le 109 pagine prodotto delle quattro categorie
ufficiali: diffusori, bocchette, griglie e bocchette/griglie/plenum VMC. Dodici
pagine riguardano accessori, plenum o regolatori, quindi non sono terminali.
Le pagine duplicate fra Diffusione e VMC mantengono entrambe le provenienze;
l'identità delle tabelle viene verificata prima di collegarle alla stessa famiglia.
Il manifest `generated/ecoclima.inventory.json` distingue quote/prestazioni
verificate, dati parziali, rumore assente e prodotti fuori ambito. L'esistenza
di una pagina o di un modello non equivale a prestazioni completamente verificate.

Manutenzione esplicita, in questo ordine:

```powershell
python scripts/catalog-import/ecoclima-complete-acquire.py
python scripts/catalog-import/ecoclima-html-grid.py
python scripts/catalog-import/ecoclima-grilles-normalize.py
python scripts/catalog-import/ecoclima-diffusers-normalize.py
python scripts/catalog-import/ecoclima-vmc-normalize.py
npm run catalog:update:ecoclima
python scripts/catalog-import/ecoclima-inventory.py
# Dopo revisione di fonti, anomalie e differenze:
npm run catalog:update:ecoclima -- --apply
```

Usare Python con `pdfplumber`; non viene utilizzato OCR. Il primo comando riusa
i documenti archiviati esistenti. Una revisione diversa va acquisita e verificata
come nuovo documento, senza sovrascrivere le fonti storiche. Il parser HTML
espande `rowspan` e `colspan` e conserva coordinate originali di ogni cella.
Le sette famiglie iniziali, gli ID delle 160 varianti e gli snapshot precedenti
restano disponibili. Il runtime legge esclusivamente JSON e fotografie locali.

EDSC-C, EDSC-CC ed EDSC-Q conservano mandata/ripresa e regolazioni D0–D7
separatamente. EDLSV e EDFLB-FL usano punti specifici per lunghezza discreta,
senza convertirli arbitrariamente per metro. Le configurazioni termiche EDRC
restano `review` finché modalità, angolo pala e Δt non sono selezionabili.
Rumore ignoto, solo limite inferiore o dati incoerenti non consentono selezione
automatica. Valori originali vengono conservati, mai corretti tramite stima.

Il nome richiesto “EGA PUSH” corrisponde alla chiusura push-pull su richiesta
della famiglia EGA6; non viene inventato un codice EGA-PUSH. Il produttore
pubblica separatamente EGQ-PUSH, EGQR-PUSH, EGF-PUSH ed EGFR-PUSH.
Per EGA quadrotti: dimensione nominale 560×560 e cornice 595×595. Per le
versioni PUSH 595×595, il plenum usa 560×560. Quote frontali, quote nominali
e attacchi non sono intercambiabili.
