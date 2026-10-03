# Importazione locale delle planimetrie

## Formati e comportamento

- DXF ASCII: parser in Web Worker, unità `$INSUNITS`, selezione esplicita layer e singoli tracciati. Supporta LINE, LWPOLYLINE/POLYLINE, ARC/CIRCLE e INSERT annidati con origine, scala, rotazione e matrici. Testi e quote sono riferimenti; non diventano muri. Spazio carta, entità non supportate e blocchi ricorsivi producono avvisi. Nessun caricamento di XREF.
- PDF: PDF.js locale, scelta pagina, anteprima raster e tracciati vettoriali di contorni dipinti con tratto. Trasformazioni, gruppi e orientamento pagina sono applicati alle coordinate. Curve approssimate con avviso. Ritagli e maschere richiedono verifica manuale. La scala della pagina non viene assunta come scala dell'edificio.
- PDF raster, PNG/JPEG/WebP: sfondo calibrato selezionando due punti e inserendo la loro distanza reale. Nessun OCR o riconoscimento AI.
- DWG: lettore locale ACadSharp3.8.0 (MIT) in processo.NET isolato; conversione ASCII e stesso wizardDXF. Nessun ODA commerciale attivato. Disegni non supportati richiedono esportazioneDXF dal CAD. Dettagli inDWG.md.

La geometria selezionata deve rappresentare **assi muro**. Le due facce disegnate nel CAD non vengono automaticamente fuse in un muro. Layer inizialmente non selezionati, conferma scala e conferma interpretazione degli assi sono obbligatori. Il wizard importa muri sul piano attivo, normalizza l'origine CAD e consente uno spostamento X/Y. Le stanze vengono ricavate dai contorni chiusi con il motore geometrico del progetto; superfici nette, volumi e carichi sono ricalcolati.

## Limiti e sicurezza

File massimo 32 MB; immagini 15 MB e 40 milioni di pixel. Il contenuto raster deve corrispondere alla firma PNG/JPEG/WebP dichiarata. DXF binario è rifiutato. DXF massimo 30.000 segmenti in anteprima, 50.000 entità espanse e profondità blocchi 12; conversione massimo 5000 muri e controlli finali del progetto. Worker DXF e caricamento PDF hanno timeout di 30 secondi. Il PDF viene reso in un canvas massimo 2200 pixel per lato; nessuna annotation layer o azione JavaScript PDF viene eseguita. Errori mostrati come messaggi operativi, senza stack trace.

## Dipendenze e licenze

- [dxf-parser](https://github.com/gdsestimating/dxf-parser), versione 1.1.2, MIT.
- [PDF.js](https://mozilla.github.io/pdf.js/), pacchetto `pdfjs-dist` 6.3.289, Apache-2.0. Documentazione [API](https://mozilla.github.io/pdf.js/api/) e [licenza originale](https://github.com/mozilla/pdf.js/blob/master/LICENSE).

Il worker PDF distribuito in `public/workers/pdf.worker.min.mjs` conserva l'avviso originale di copyright; `PDFJS-LICENSE.txt` contiene la licenza completa. `node scripts/sync-pdf-worker.mjs` deve essere eseguito dopo l'installazione o aggiornamento di PDF.js per mantenere la stessa versione del client e del worker. Il rendering non dipende da CDN o servizi remoti.

## Verifica

`src/services/import/plan.test.ts`: unità/layer, geometrie, INSERT, curve, selezione/duplicati, scala, rifiuti di formato/dimensione, operatori PDF e parsing di un vero PDF generato con pdf-lib.

`tests/import.spec.ts`: wizard DXF → stanza → autosave/reload, PDF vettoriale → calibrazione → sfondo/reload, DWG → spiegazione conversione senza geometrie inventate.
