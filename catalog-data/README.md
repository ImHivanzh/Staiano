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

Discovery copre EDLS, EBLF, EADD, EGS, EGQ, ETA, EVVMC/EVVMB. Altre famiglie
non sono ancora normalizzate né rese selezionabili. Non confondere dati trovati
con dati importati o milestone completate.
