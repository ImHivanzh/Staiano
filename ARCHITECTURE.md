# Staiano HVAC — decisioni architetturali

## Ambito e vincoli

Configuratore preliminare di abitazioni: geometria netta, stima convenzionale
volume × 35 W/m³, dimensionamento su cataloghi ufficiali, controlli e dossier.
La creazione manuale è un ingresso principale, equivalente all'importazione.
Nessuna AI, OCR, autenticazione, cloud obbligatorio o API a pagamento.

## ADR 001 — stack e confini

Next.js 16.3.8 e React 19.3.0 (versioni stabili verificate nel registro npm),
TypeScript strict, Zod per tutti i confini dati, Zustand per comandi e selezione.
SVG per editor metrico 2D; Three.js/React Three Fiber per il modello tecnico 3D.
I motori di geometria, termico e selezione sono funzioni pure indipendenti da React.
Le dipendenze sono bloccate da package-lock.json. Nessun font o CDN remoto.

## ADR 002 — unità, muri e stanze

Coordinate in metri, dimensioni catalogo in mm, potenze W, portate m³/h.
I muri rappresentano assi con spessore. Le facce del grafo planare chiuso sono
intersecate con le rette traslate di mezzo spessore: il poligono stanza è il
contorno interno, non l'asse. Le intersezioni dei muri dividono i segmenti del
grafo. Identità/nome/altezza delle stanze vengono riconciliati dopo i comandi.
Il comando rettangolo accetta dimensioni NETTE e genera assi esterni coerenti.
Geometrie non valide bloccano i risultati tecnici; nessun risultato stale.

## ADR 003 — persistenza e formato

ProjectRepository separa il dominio da IndexedDB. Database locale con progetti,
metadati e snapshot precedente. Scritture serializzate; autosave dopo comando
completato, stato di errore visibile e import/export disponibile. `.hvacproj` è
JSON UTF-8 versionato, validato, con limiti di dimensione e riferimenti coerenti.
Migrazioni esplicite: nessuna conversione silenziosa di versioni future.
Le grandezze derivate si ricalcolano all'importazione e alla lettura.

## ADR 004 — comandi e rendering

Undo/redo a livello di progetto, selezione e vista fuori dalla cronologia.
Drag visualizzato localmente e confermato una volta al rilascio, senza autosave
o ricalcolo globale ad ogni pixel. Un solo progetto alimenta editor 2D e 3D.
Più piani con geometria e scala indipendenti. Dispositivi e font serviti localmente.

## ADR 005 — cataloghi e integrità tecnica

Snapshot versionati, dati originali e metadata di fonte conservati. Importer
separati dal runtime; schema validato prima della sostituzione, diff e backup.
Dati mancanti null. Compatibilità multisplit solo da tabelle ufficiali.
Rumore massimo 37 dB(A) nel dominio. Potenze senza arrotondamenti intermedi.
Cataloghi mai popolati con esempi concettuali o valori inventati.

## ADR 006 — import e licenze

Raster: sfondo locale con calibrazione a due punti, nessun riconoscimento AI.
DXF: dxf-parser (MIT), layer scelti dall'operatore e scala verificata.
PDF: pdfjs-dist (Apache-2.0) per rasterizzazione locale; pdf-lib (MIT) per dossier.
DWG: conversione esterna a DXF finché non esiste parser commerciale compatibile;
LibreDWG GPL non viene incluso. Import non deve eseguire dati caricati.
Next/React/Zustand/Three/R3F/Zod/Vitest/Phosphor: MIT; Playwright: Apache-2.0.
Verificare licenze delle versioni installate e diritti di redistribuzione dei
cataloghi prima di pubblicare il prodotto. Nessuna libreria GPL selezionata.

## ADR 007 — grafica e distribuzione

Sistema comune Staiano: copia immutata di sistema.css, logo e Inter locale.
Tema chiaro, navigazione blu, tinta HVAC ciano. Nessun login secondo il brief.
Nessuna modifica agli altri gestionali, al portale o Caddy durante questa base.
Un avvio locale su 127.0.0.1:3015; futura pubblicazione separata dal dominio.

## Rischi e verifiche

- Grafo planare e offset in concavità: test su intersezioni, tagli, giunzioni,
  poligoni irregolari; errori espliciti se geometria degenerata.
- Cataloghi: tabelle PDF complesse, disponibilità e revisioni; acquisizione
  ufficiale e fixture ripetibili, mai scraping durante l'uso.
- Quota storage/browser: messaggio persistente, export e recupero snapshot.
- WebGL indisponibile: messaggio e editor 2D funzionante.
- 100 muri / 50 stanze / 100 apparecchi: test di carico dopo integrazione.
- Test: Vitest per formule/invarianti/repository; Playwright per creazione,
  modifica, salvataggio, reload, import/export, errore e responsive.

## Fonti tecniche

- https://nextjs.org/docs/app/getting-started/installation
- https://github.com/gdsestimating/dxf-parser (licenza MIT)
- https://github.com/mozilla/pdf.js (licenza Apache-2.0)
- https://github.com/Hopding/pdf-lib (licenza MIT)
