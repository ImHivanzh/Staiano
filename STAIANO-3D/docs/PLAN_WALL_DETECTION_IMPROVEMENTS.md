# Rilevamento e selezione muri: piano e implementazione

Data: 26 ottobre 2026. Il piano è stato implementato nelle sorgenti con algoritmo `local-lines-9`. Le sezioni di indagine conservano la baseline precedente; il riscontro dell'implementazione è riportato in fondo. Su richiesta dell'utente non vengono avviate ulteriori build o creati nuovi EXE.

## Risultato dell'indagine

Il caso «oltre 40 muri» è riprodotto: il riconoscimento locale con AI restituisce **44 candidati nel layer Muri riconosciuti**, oltre a **42 Contorni da verificare**, per **86 candidati complessivi**. Sono segmenti geometrici, non un conteggio certificato delle pareti dell'edificio. Nessuno raggiunge la soglia euristica di alta affidabilità, pari a 0,9. Questo non significa che siano tutti errati.

La sovrapposizione al documento mostra contemporaneamente:

- frammenti e assi paralleli relativi alla stessa parete, soprattutto presso corridoio, aperture e pilastri;
- pareti reali incomplete, in particolare lungo parte del perimetro;
- bordo pagina, cartiglio, quote e dettagli dei serramenti fra i contorni alternativi.

Non è stato annotato l'intero edificio: il numero corretto di pareti distinte e la precisione globale restano da misurare. Abbassare il contatore sotto 40 non è un criterio di successo.

## Prova riproducibile

Documento locale: `26_09_26_quote_aperture_esterne_rev_1.pdf`, una pagina A3 orizzontale, vettoriale, senza immagini raster incorporate. SHA-256: `E0711641B117F3D1DF0DDD8E2665737DA83E7B6F682D33F556432BEE27C4AA45`.

Sono state chiamate le funzioni effettive `readPlanFile`, `analyzePlan`, `analyzeVectorPlan` e `analyzeRasterPixels`, con un worker ricompilato dalle sorgenti attuali. Esecuzione in Edge senza interfaccia, su server diagnostico temporaneo locale. L'applicazione non era raggiungibile sulla porta 3015. Il servizio Raster2Seq è stato dichiarato indisponibile nell'ambiente diagnostico; il runtime Python indicato dal repository non esiste su questa copia.

Lettura PDF.js: **2200 × 1556 pixel**, **5040 segmenti vettoriali**, **145 elementi testuali**. La seconda immagine di analisi esclude i testi tramite il filtro già presente nell'applicazione.

| Elaborazione | Candidati totali | Muri riconosciuti | Contorni da verificare |
| --- | ---: | ---: | ---: |
| Vettoriale attuale | 0 | 0 | 0 |
| Raster euristico, pagina intera | 68 | 55 | 13 |
| AI locale WebGPU + raster, pagina intera | 86 | 44 | 42 |
| Raster euristico, ritaglio della pianta | 88 | 71 | 17 |
| AI locale WebGPU + raster, ritaglio della pianta | 113 | 61 | 52 |

Ritaglio verificato: da `(650,450)` a `(1720,1200)` nelle coordinate dell'anteprima, comprendendo il corpo principale della pianta. Non costituisce un'annotazione completa di tutti gli elementi esterni.

Esperimento aggiuntivo, senza modificare l'app: sbiancare i pixel con differenza fra canali RGB maggiore di 24 aumenta i candidati euristici da 68 a 78 sulla pagina e da 88 a 128 nel ritaglio. Non dimostra che il colore sia inutile: dimostra che una cancellazione raster indiscriminata altera la geometria e non basta come soluzione.

Script, risultati JSON e immagini annotate restano nella cartella ignorata `tmp/plan-investigation/`. Riproduzione dalla cartella `STAIANO-3D`: `node tmp/plan-investigation/run.mjs`, quindi `node tmp/plan-investigation/overlay.mjs`. Il primo script usa il percorso locale del PDF e richiede Edge e le dipendenze già installate. Non carica il documento su servizi esterni.

## Cause verificate nel codice

1. **La strada vettoriale viene disattivata su questa tavola.** `pdf-vectors.ts` conserva solo estremi, layer generico e tipo; perde colore, spessore e tratteggio. Approssima inoltre ogni curva con 16 segmenti. `analyzeVectorPlan` interrompe l'analisi sopra 3000 segmenti: qui ne arrivano 5040. Si perde così la possibilità di distinguere quote colorate e geometria architettonica prima del raster.
2. **Il risultato mescola prove diverse.** `raster-lines.ts` combina segmentazione e rilevamento euristico; successivamente riaggiunge contorni non confermati dall'AI a `walls`. Il riepilogo del wizard conta anche questi. Alcuni sono riferimenti utili, altri evidenti falsi positivi.
3. **Raggruppamento e deduplicazione lasciano più assi per la stessa parete.** `clusterWalls` usa 6 pixel di tolleranza trasversale e al massimo 1 pixel di distanza fra intervalli. Nell'output principale verificato, per esempio, due candidati del corridoio occupano circa `x=1315..1475`, rispettivamente a `y=788,25` e `y=802,25`. Entrano entrambi nel conteggio. La deduplicazione in importazione elimina solo segmenti con estremi praticamente identici.
4. **Il ritaglio cambia i criteri geometrici.** La lunghezza minima è `max(18, min(width,height)*0,025)`: circa 39 pixel sulla pagina, 19 nel ritaglio. Anche la pianta occupa una porzione diversa dell'ingresso AI da 512 × 512. Il maggior numero dopo il ritaglio non implica automaticamente una qualità peggiore: possono aumentare sia i recuperi corretti sia i frammenti.
5. **La selezione richiede troppo lavoro manuale.** Il wizard offre clic sulle linee di 2–3 pixel, colori simili distinti principalmente dall'opacità e un comando generico «Escludi / includi tracciati». La checkbox collettiva tratta insieme candidati medi e alternative con punteggio 0,5, senza limitarli alla vista corrente. In modalità ricostruita tutti i candidati sono preselezionati e i dettagli sono chiusi.

Rischio separato, verificato per lettura del codice ma non eseguito qui: `automatic-plan.ts` allinea Raster2Seq anche a `imageWalls`, cioè alle proposte euristiche originali; la deduplicazione finale confronta gli estremi arrotondati. Va collaudato anche questo ramo prima di attribuirgli il risultato del caso utente.

## Piano di intervento, in ordine

### 1. Fissare il riferimento e correggere il significato dei contatori

- Annotare localmente assi reali, aperture e falsi positivi della tavola. Separare pareti logiche, segmenti e alternative. Conservare documento e annotazioni private fuori da Git; non riutilizzare il manifest privato di un altro campione.
- Mostrare sempre tre valori: proposte principali, alternative e segmenti effettivamente selezionati. Le alternative non devono apparire come muri già riconosciuti o approvati.
- Rendere esplicito lo stato: proposto, selezionato, escluso, da verificare. Nessuna preselezione indiscriminata perché la ricostruzione ha trovato almeno una stanza.

**Prova:** la pagina intera di questo caso deve distinguere i 44 candidati principali dai 42 alternativi; il numero sul pulsante Importa deve corrispondere alle geometrie effettive del risultato preparato.

### 2. Rendere la selezione diretta e leggibile

Flusso proposto: **Area della pianta → Misura reale → Riconoscimento → Controllo muri → Importazione**. Riutilizzare il ritaglio, la calibrazione, lo zoom e l'importazione già esistenti.

- Pianta come area principale, pannello laterale compatto; selezione visibile senza aprire i dettagli tecnici. Destinazioni: PC e iPad.
- Comandi distinti «Seleziona» e «Escludi», con clic ripetuto prevedibile; Annulla/Ripristina per gli interventi della sessione.
- Area cliccabile trasparente attorno all'asse, indipendente dalla sottile linea disegnata; risoluzione del candidato più vicino quando più assi si sovrappongono. Soglia più ampia per il tocco, senza ostacolare zoom e trascinamento.
- Evidenziazione al passaggio e su selezione, codice breve, lunghezza e spessore calibrati, spiegazione comprensibile della proposta. Stato distinto anche con tratteggio e simbolo, non soltanto col colore.
- «Mostra alternative» separato da «Includi». Accettare una proposta non deve accettare automaticamente le sue interpretazioni alternative incompatibili.
- Selezione rettangolare e azioni collettive limitate alle proposte visibili; su iPad usare pulsanti espliciti, senza dipendere da Shift o dal passaggio del mouse. Accesso equivalente tramite elenco e tastiera.
- Un clic può selezionare una fila coerente; comando esplicito per il singolo frammento. Riutilizzare il concetto già presente in `wall-runs.ts`, verificando l'adattamento ai candidati. Raggruppare visivamente non significa riempire le aperture.
- Prima dell'importazione mostrare il riepilogo dei soli muri scelti e le aperture ancora da verificare. Mantenere «Solo sfondo» come uscita utile quando il riconoscimento è insufficiente.

**Prova:** selezionare ed escludere lo stesso muro a diversi zoom; gestire assi ravvicinati senza scegliere il bordo sbagliato; correggere una fila in un'azione; recuperare con Annulla; completare su PC e iPad senza comandi nascosti.

### 3. Recuperare l'informazione vettoriale utile prima dell'AI

- Conservare colore, larghezza del tratto, tratteggio e origine della primitiva durante l'estrazione PDF, rispettando trasformazioni e stato save/restore.
- Usare questi attributi come indizi combinati: in questa tavola quote rosse/blu e architettura neutra sono separabili; in altre tavole anche un muro può essere colorato.
- Escludere dall'analisi l'area esterna scelta, riconoscere cornice e cartiglio, aggregare tratti collineari della stessa primitiva. Gestire archi e piccoli simboli senza moltiplicare inutilmente i candidati muro.
- Applicare il limite di complessità dopo questa pulizia, conservando protezioni e alternativa manuale. Non alzare semplicemente il limite: la ricerca corrente delle coppie è quadratica.
- Recuperare assi centrali e spessori dalle coppie di facce vettoriali; usare raster e AI come supporto dove i vettori mancano o sono ambigui.

**Prova:** questo PDF deve arrivare al riconoscimento con le quote distinguibili; nessun bordo del foglio o cartiglio fra i muri selezionati automaticamente. Conservare muri sottili e colorati nei campioni dedicati.

### 4. Unificare assi, frammenti e alternative senza perdere muri veri

- Stabilizzare le tolleranze usando scala confermata, spessore stimato e risoluzione effettiva, evitando che il solo ritaglio dimezzi arbitrariamente la lunghezza minima.
- Deduplicare tramite direzione, distanza fra assi, sovrapposizione degli intervalli e compatibilità dello spessore; selezionare un asse canonico invece di mediare indiscriminatamente tutte le interpretazioni.
- Conservare la provenienza e il motivo dell'esclusione. Le alternative devono restare recuperabili, senza gonfiare il gruppo principale.
- Unire fisicamente solo intervalli compatibili e supportati. Porte, finestre, pilastri e giunzioni restano espliciti; pareti parallele distinte non devono collassare in una sola.
- Nel ramo Raster2Seq verificare il supporto dei tratti e l'unicità dei muri condivisi prima della preselezione. Non trasformare qualunque varco in una porta certa.

**Prova:** assi paralleli duplicati del corridoio risolti, aperture conservate, nessuna nuova chiusura o parete traslata; perimetro e divisori annotati recuperati anche se il numero finale dei segmenti resta superiore a 40.

### 5. Migliorare l'AI solo dopo aver misurato il risultato precedente

Confrontare pagina e ritaglio dopo pulizia vettoriale e raggruppamento. Se restano omissioni da perdita di dettaglio a 512 pixel, provare ritagli sovrapposti con coordinate condivise e deduplicazione dei bordi. L'AI resta una proposta verificabile. Non sono previsti nuovi servizi remoti, dipendenze o addestramenti in questa prima correzione.

## Verifica e perimetro tecnico

File principali: `src/services/import/pdf-vectors.ts`, `plan-types.ts`, `plan-file.ts`, `analyze.ts`; `src/domain/geometry/plan-analysis.ts`, `raster-lines.ts`, `automatic-plan.ts`, `import-plan.ts`; `src/configurator/import/PlanImportWizard.tsx` e relativo CSS. Il worker va toccato solo se cambia il contratto dei dati o la segmentazione. Preferire metadati facoltativi in memoria; nessuna migrazione dei progetti salvati se non indispensabile. Aggiornare `PLAN_IMPORT.md` e `PLAN_RECOGNITION.md`, che descrivono ancora un algoritmo precedente.

Riutilizzare test `plan.test.ts`, `raster-lines.test.ts`, `plan-analysis.test.ts`, `automatic-plan.test.ts` e i flussi browser di riconoscimento. Aggiungere casi mirati per quote colorate, cartiglio, coppie duplicate, pareti parallele reali, muri sottili, aperture e invarianti fra pagina e ritaglio. Conservare i casi raster, CAD e PDF misti esistenti.

Misurare **precisione e copertura dei muri annotati**, duplicati, aperture alterate e numero di azioni manuali. L'attuale copertura di pochi tratti, includendo le alternative, non misura i falsi positivi. Obiettivi iniziali da verificare sull'annotazione completa: almeno 95% di precisione e 95% di copertura in lunghezza, zero cornici/quote preselezionate, zero duplicati sulle pareti di riferimento e nessuna apertura chiusa. Sono obiettivi, non risultati già ottenuti.

Eseguire prima i test mirati; al rilascio completare build, riavvio e verifica HTTP secondo `AGENTS.md`. Nessuna build, pubblicazione o modifica ai progetti è necessaria per consegnare questa indagine.

## Limiti dell'indagine iniziale

L'indagine iniziale riproduceva il ramo locale WebGPU, senza modificare il prodotto né eseguire Raster2Seq o l'EXE installato. Il numero corretto delle pareti non era stato annotato interamente. Questa baseline ha permesso di verificare che ritaglio, cancellazione del colore o una soglia più alta non risolvono da soli il problema.

## Riscontro dell'implementazione

Sono stati attuati i seguenti interventi:

| Parte del piano | Comportamento implementato | Prova disponibile |
| --- | --- | --- |
| Lettura vettoriale | Conservazione di colore, spessore normale alla linea anche con trasformazioni non uniformi, tratteggio e primitiva; pulizia prima della ricerca delle facce; originali sempre disponibili | Test `pdf-vectors`, `pdf-wall-segments`, `plan`; regressione sul PDF privato |
| Assi e alternative | Asse canonico misurato invece della media fra interpretazioni; unione di intervalli compatibili, alternative separate, assi CAD originali mantenuti per selezione fine | Test `plan-candidates`, `plan-analysis`, `raster-lines` e selezione browser |
| Aperture | Lettura dei varchi vettoriali e dei serramenti sottili; sottrazione dei varchi dai tratti raster con conservazione delle alternative; Raster2Seq non si allinea ai contorni scartati | Test `plan-candidates`, `automatic-plan`, regressione privata sui varchi |
| Scala e ritaglio | Scala confermata nel riconoscimento, risoluzione di riferimento stabile, coordinate locali ritagliate e piccolo margine sui bordi | Test di clipping e regressione privata prima/dopo quota 16,40 m |
| Dettaglio AI | Lettura globale e, in assenza di facce vettoriali sufficienti, al massimo quattro ritagli sovrapposti; esclusione dei bordi artificiali e coordinate condivise | Test di copertura dei ritagli e test browser del worker dettagliato |
| Selezione | Contatori distinti, bersaglio al tratto più vicino, azioni Seleziona/Escludi, fila o singolo tratto, rettangolo, elenco ricercabile, alternative su richiesta, esclusione delle interpretazioni incompatibili e Annulla/Ripristina | Flussi browser PC, iPad e tocco reale; prova d'importazione dei muri scelti |
| Compatibilità | Nessuna migrazione dei progetti, nessuna dipendenza o servizio remoto aggiunto; worker annullabile; conservati sfondo e selezione manuale | Suite unitaria completa: 941 test passati in 145 file; flussi DXF, PDF, raster e PDF misti |

Documento, immagini, manifest dei riferimenti e risultati privati restano nella cartella ignorata `tmp/plan-investigation/`. La regressione privata controlla 30 tratti opachi, 12 varchi e 9 riferimenti non murari, con soglia di copertura in lunghezza del 95%; non certifica la precisione globale di tutte le geometrie della tavola. I riscontri iniziali passano da circa il 59,5% al 99% sui tratti annotati, senza usare il numero totale di candidati come obiettivo.

Le istruzioni operative aggiornate sono in `PLAN_IMPORT.md`; metodo e limiti delle misure sono in `PLAN_RECOGNITION.md`. Il runtime reale Raster2Seq rimane indisponibile su questa copia: il contratto geometrico e il comportamento di riserva sono verificati, l'inferenza del modello avanzato non viene dichiarata collaudata. L'EXE installato non è stato sostituito e non è stata effettuata alcuna pubblicazione GitLab.

## Richieste aggiuntive completate

- **Stato AI**: modello browser separato dal runtime server, verifica esplicita di Python/dipendenze, CPU/CUDA e istruzioni copiabili per il setup sul PC server. Timeout, errori e assenza del runtime coperti da test; nessun download automatico.
- **Dossier sintetico cliente**: rimosse sezioni di controlli, anomalie, avvisi e clausole diagnostiche nelle note materiali. Numeri effettivi e dati mancanti restano distinti; i controlli interni e il dossier completo conservano gli avvisi. Incluse le tavole planimetriche A3 dei piani con geometria.
- **Etichette del corridoio a L**: il baricentro geometrico può essere esterno al locale. La posizione visiva ora usa un punto interno con spazio dai bordi, condiviso fra 2D, proiezione 3D e planimetria PDF; il baricentro e le misure del progetto non cambiano.
- **Tracciati sovrapposti**: in modalità Escludi il clic e l'anteprima del bersaglio considerano soltanto tracciati inclusi.

Verifiche mirate aggiuntive: test geometrici (anche corridoi molto lunghi e stretti) e di proiezione, controllo AI con runtime simulato, contratto PDF sintetico/completo e coefficiente termico; browser per stato AI e corridoio concavo; cinque flussi di zoom/selezione PC, tablet e tocco. PDF campione renderizzato e ispezionato visivamente. Il precedente giro browser completo ha riportato 280 passati, 3 saltati e 3 falliti: il caso zoom di questa modifica è ora corretto e passa; i due fallimenti del compositore terminali non sono stati ricontrollati in questo ambito. TypeScript, ESLint dei file runtime coinvolti e formattazione passano al controllo finale. Nessuna ulteriore build dopo la richiesta dell'utente.
