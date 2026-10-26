# Importazione locale delle planimetrie

## Formati e comportamento

- DXF ASCII: parser in Web Worker, unità `$INSUNITS`, selezione esplicita layer e singoli tracciati. Supporta LINE, LWPOLYLINE/POLYLINE, ARC/CIRCLE e INSERT annidati con origine, scala, rotazione e matrici. Testi e quote sono riferimenti; non diventano muri. Spazio carta, entità non supportate e blocchi ricorsivi producono avvisi. Nessun caricamento di XREF.
- PDF: PDF.js locale, scelta pagina, anteprima raster e tracciati vettoriali con colore, spessore trasformato, tratteggio e provenienza della primitiva. La pulizia precede il limite di complessità: quote sottili colorate, cornici e simboli non sopprimono l'analisi dei muri. I tracciati originali restano disponibili. Curve approssimate con avviso e conservate come riferimento. La scala della pagina non viene assunta come scala dell'edificio.
- PDF raster, PNG/JPEG/WebP: sfondo calibrato selezionando due punti e inserendo la loro distanza reale. Riconoscimento locale di tratti pieni, facce parallele, contorni sottili e segmenti obliqui. Nessun OCR o servizio AI esterno. I PDF misti vengono analizzati anche come immagine: una linea vettoriale decorativa non esclude più il riconoscimento della scansione.
- DWG: lettore locale ACadSharp3.8.0 (MIT) in processo.NET isolato; conversione ASCII e stesso wizardDXF. Nessun ODA commerciale attivato. Disegni non supportati richiedono esportazioneDXF dal CAD. Dettagli inDWG.md.

La geometria selezionata deve rappresentare **assi muro**. Il riconoscitore propone assi centrali dalle facce parallele; giunzioni, spessori e interpretazioni ambigue richiedono verifica. I muri ad alta evidenza euristica sono preselezionati; le proposte medie restano escluse fino alla conferma e le alternative sottili sono nel layer `Contorni da verificare`. Scala e interpretazione degli assi vanno confermate. Il wizard importa muri sul piano attivo, normalizza l'origine CAD e consente uno spostamento X/Y. Le stanze vengono ricavate dai contorni chiusi con il motore geometrico del progetto; superfici nette, volumi e carichi sono ricalcolati.

Per un foglio con cartiglio, prospetti o più piante, scegliere **Seleziona area da riconoscere**, cliccare due angoli opposti e usare **Riconosci muri nell'area**. L'anteprima si adatta all'area e i tracciati PDF originali rimangono attenuati e selezionabili. Il riconoscimento non chiude automaticamente i varchi di porte o finestre e non ricava altezze da un'immagine. La guida e le proprietà scorrono nel pannello laterale, mentre l'editor resta contenuto nella finestra; i comandi documento sono raccolti nel menu `Documento e progetto`.

## Controllo dei muri

Il riepilogo distingue **proposte principali**, **alternative** e **segmenti selezionati**. Non sono conteggi certificati delle pareti fisiche. Anche una ricostruzione con stanze richiede la selezione dei muri e la conferma esplicita degli assi.

Delimitare l'area, calibrare una quota reale e usare **Riconosci con la scala verificata**. Le tolleranze conservano il riferimento dell'immagine originale e, quando disponibile, la scala confermata; un piccolo margine di contesto preserva le due facce dei muri sul bordo del ritaglio. Assi vettoriali misurati e immagine si integrano. Su immagini grandi senza coppie vettoriali utili, l'AI locale usa al massimo quattro ritagli sovrapposti oltre alla lettura globale.

**Seleziona** e **Escludi** applicano un'azione esplicita al muro più vicino, con tolleranza di 18 pixel sullo schermo. La fila comprende tratti collineari adiacenti, senza saltare le porte. Disattivare **Seleziona l'intera fila di muri** per il singolo tratto. **Rettangolo** usa due clic e agisce sui segmenti interamente contenuti. Le azioni collettive sono limitate alle proposte visibili; **Mostra alternative** cambia solo la visibilità. Accettare un'alternativa esclude le interpretazioni sovrapposte incompatibili. Annulla/Ripristina e Ctrl/Cmd+Z ripercorrono le selezioni; i campi di testo mantengono i propri comandi.

L'elenco offre ricerca, caselle accessibili da tastiera, codice del muro, stato e lunghezza calibrata; l'ispettore mostra spessore e motivo della proposta. Una linea continua indica selezione, un tratteggio lungo una proposta e un tratteggio corto un'alternativa. Il contatore d'importazione usa le geometrie effettivamente preparate, eliminando i duplicati esatti.

Con **Escludi** il bersaglio è cercato fra i tracciati inclusi: una proposta sovrapposta già esclusa non intercetta il clic al posto del muro selezionato.

## Stato AI e attivazione

**Importa planimetria → Stato AI** distingue il modello locale del browser dal runtime avanzato sul server. La lettura iniziale controlla configurazione e file senza caricare il modello. **Verifica AI** esegue un controllo limitato a 15 secondi su Python 3.12, dipendenze e disponibilità CUDA/CPU. «Ambiente pronto» non certifica l'inferenza del checkpoint, caricato soltanto durante la ricostruzione.

Se manca il runtime, il pannello offre il comando copiabile per `deploy/setup-plan-recognizer.ps1`. Eseguirlo sul PC server, dalla cartella contenente `deploy` (nell'EXE è la cartella `runtime` accanto all'eseguibile), dopo aver installato Python 3.12. Il download occupa diversi GB; il pulsante di verifica non avvia l'installazione. Il riconoscitore parte su richiesta, senza un servizio Windows separato. Dopo il setup basta ripetere **Verifica AI**, senza build. Dettagli in `native/PlanRecognizer/README.md`.

I varchi fra facce vettoriali e i serramenti sottili fra pareti più spesse restano proposte da verificare. Una linea raster che attraversa un varco viene conservata fra le alternative; i tratti murari ai lati restano separati. Non vengono assegnati automaticamente tipo o quote verticali ai varchi privi di classificazione. La conversione può essere disattivata per importare solo lo sfondo calibrato.

## Limiti e sicurezza

File massimo 32 MB; immagini 15 MB e 40 milioni di pixel. Il contenuto raster deve corrispondere alla firma PNG/JPEG/WebP dichiarata. DXF binario è rifiutato. DXF massimo 30.000 segmenti in anteprima, 50.000 entità espanse e profondità blocchi 12; conversione massimo 5000 muri e controlli finali del progetto. Worker DXF e caricamento PDF hanno timeout di 30 secondi. Il PDF viene reso in un canvas massimo 2200 pixel per lato; nessuna annotation layer o azione JavaScript PDF viene eseguita. Errori mostrati come messaggi operativi, senza stack trace.

## Dipendenze e licenze

- [dxf-parser](https://github.com/gdsestimating/dxf-parser), versione 1.1.2, MIT.
- [PDF.js](https://mozilla.github.io/pdf.js/), pacchetto `pdfjs-dist` 6.3.289, Apache-2.0. Documentazione [API](https://mozilla.github.io/pdf.js/api/) e [licenza originale](https://github.com/mozilla/pdf.js/blob/master/LICENSE).

Il worker PDF distribuito in `public/workers/pdf.worker.min.mjs` conserva l'avviso originale di copyright; `PDFJS-LICENSE.txt` contiene la licenza completa. `node scripts/sync-pdf-worker.mjs` deve essere eseguito dopo l'installazione o aggiornamento di PDF.js per mantenere la stessa versione del client e del worker. Il rendering non dipende da CDN o servizi remoti.

## Verifica

`src/services/import/plan.test.ts`: unità/layer, geometrie, INSERT, curve, selezione/duplicati, scala, rifiuti di formato/dimensione, operatori PDF e parsing di un vero PDF generato con pdf-lib.

`tests/import.spec.ts`: wizard DXF → stanza → autosave/reload, PDF vettoriale → calibrazione → sfondo/reload, DWG → spiegazione conversione senza geometrie inventate.

`src/domain/geometry/raster-lines.test.ts`: riferimenti reali, contorni chiari da un pixel, facce interrotte, muri obliqui, retini e validazione dei dati. `tests/import-recognition.spec.ts`: PDF misto → muri → salvataggio/reload → 3D e layout confinato su desktop, tablet e telefono. Corpus e limiti delle misure in `PLAN_RECOGNITION.md`.
