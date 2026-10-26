# Verifica del riconoscimento planimetrie

Il riconoscimento `local-lines-9` usa lettura vettoriale, segmentazione AI locale e geometria nel browser, con ricostruzione Raster2Seq facoltativa sul server locale. Conserva fino a 2200 pixel sul lato maggiore. Gli stili PDF distinguono le quote sottili colorate dalla struttura; gli assi misurati dalle facce vettoriali precedono le interpretazioni raster incompatibili. I contorni alternativi sono recuperabili e separati dalla selezione. Un punteggio euristico non certifica la destinazione architettonica di un tratto.

La deduplicazione confronta direzione, intervallo, spessore e distanza fra assi. Unisce sovrapposizioni e intervalli adiacenti senza riempire i varchi; interpretazioni concorrenti rimangono da verificare. L'analisi dei ritagli conserva il riferimento dimensionale originale e può usare la scala confermata dall'operatore. Le immagini grandi senza geometria vettoriale utile vengono lette anche con quattro ritagli sovrapposti al massimo, con esclusione dei bordi artificiali. Il worker viene terminato quando l'importazione è annullata.

## Regressione privata delle aperture esterne

La tavola privata analizzata il 26 ottobre 2026 ha 5040 segmenti PDF originali. Il vecchio percorso vettoriale si interrompeva oltre 3000. Il nuovo filtro conserva gli originali e permette di analizzare le facce utili senza aumentare il limite della ricerca quadratica.

Le annotazioni locali identificano 30 tratti opachi, 12 varchi e 9 riferimenti non murari. La copertura in lunghezza dei tratti opachi campionati, con distanza massima di 8 pixel, passa dal 59,5% iniziale a circa il 99% nelle verifiche locali. Pagina e ritaglio vengono controllati anche nel vero wizard, con calibrazione sulla quota 16,40 m. Il test verifica separatamente che i riferimenti di cartiglio, cornice e quote non diventino muri principali e che i varchi annotati non siano completamente chiusi. Questi numeri non rappresentano precisione globale, conteggio completo delle pareti o garanzia su altre tavole.

PDF, immagini e annotazioni restano in cartelle ignorate. `tests/plan-private.spec.ts` usa `PRIVATE_PLAN_PDF` e `PRIVATE_PLAN_REFERENCE`; senza entrambi viene saltato. I test pubblici sintetici verificano stili e trasformazioni PDF, muri colorati e sottili, pareti parallele distinte, sovrapposizioni, conservazione delle porte, selezione della fila e coordinate dei ritagli. I controlli browser della selezione comprendono PC e iPad, annullamento, contatori e importazione reale.

## Campioni pubblici

Sono stati scaricati quattro PDF e verificati cinque casi nel browser attraverso il vero wizard, compreso il cambio pagina e la selezione di un'area. Sono inoltre disponibili cinque ritagli compressi per regressioni offline.

| Campione                     | Pagina | Caratteristiche                                                    | Fonte                                                                                                                               |
| ---------------------------- | ------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Moretti                      | 1      | Scansione a colori con arredi, pavimenti e muri                    | [Planimetria appartamento](https://immobiliaremoretti.it/wp-content/uploads/2020/09/Planimetria-appartamento.pdf)                   |
| Lemon                        | 1      | Foglio con più piante, muri pieni, finestre e retini               | [Appartamento n. 3](https://lemonimmobiliare.it/wp-content/uploads/2025/04/app.-n.3.pdf)                                            |
| Delbono                      | 1      | PDF vettoriale molto denso con riempimenti grigi e arredi          | [Appartamento n. 16](https://www.delbono.com/wp-content/uploads/2025/01/16-1.pdf)                                                   |
| UniTE, edificio residenziale | 32     | Disegno scansionato con quote e tratti non perfettamente allineati | [Rappresentazione grafica](https://www.unite.it/UniTE/Engine/RAServeFile.php/f/File_Prof/BOVO_3665/2a_Rappresentazione_grafica.pdf) |
| UniTE, fabbricato rurale     | 39     | Muri grigi, retini e più rappresentazioni sullo stesso foglio      | Stessa fonte                                                                                                                        |

Il PDF privato fornito dall'utente è stato verificato localmente come sesto caso. Immagine, annotazioni e documento originale restano nella cache ignorata, esclusi dal repository.

## Cosa misurano i test

Esecuzione iniziale nel browser sui PDF originali (`local-lines-2`): Moretti 100%, Lemon 87,5%, Delbono 91,9%, UniTE residenziale 77,8%, UniTE rurale 100%. Il documento privato locale raggiunge il 75,8%. Sono percentuali di copertura dei soli riferimenti campionati, incluse le proposte da confermare, non percentuali di precisione complessiva né di muri importati automaticamente.

Il manifest contiene 40 tratti di muro annotati manualmente nei cinque campioni pubblici. Ogni tratto viene campionato in 31 punti: un punto è coperto quando un asse proposto è parallelo e dista al massimo 9 pixel dal riferimento. La regressione richiede almeno il 65% di copertura per ogni caso. Questa è una misura sui riferimenti campionati, **non precisione o richiamo globali del riconoscimento**: non sono state annotate tutte le geometrie né tutti i falsi candidati. Le proposte da verificare partecipano alla misura e non vengono per questo importate automaticamente.

Il calcolo avviene nel Web Worker già usato per i CAD, con timeout e limiti di dimensione/densità; l’interfaccia resta reattiva durante l’analisi. Le facce CAD parziali conservano i varchi, gli assi misurati si incontrano agli angoli e i layer di quote, testi, arredi e retini vengono esclusi dalle proposte automatiche.

I test sintetici verificano separatamente scansioni rumorose ruotate a 3°, 23°, 45° e 90°, assenza di duplicati, coordinate esatte degli assi, contorni di un pixel, coppie di facce con lunghezze diverse, conservazione dei varchi e assenza di stanze automatiche dai reticoli. Nel corpus, le geometrie prive di evidenza forte restano da confermare. Il test di PDF misto prova l'importazione reale di quattro muri, la persistenza e il rendering 3D. Il layout viene verificato a 1366×768, 800×900 e 390×844: pagina senza scorrimento globale e scorrimento confinato ai pannelli.

## Verifica delle varianti

`tests/recognition-variants.spec.ts` aggiunge 15 importazioni reali: per ognuno dei cinque ritagli pubblici controlla PNG con contrasto al 60%, JPEG con dimensioni al 75% e qualità 0,5, e WebP ruotato di 3° con qualità 0,5. La copertura dei riferimenti campionati varia dall’80,6% al 100% nell’esecuzione locale; queste misure includono proposte manuali e non rappresentano precisione globale o importazione completamente automatica.

La nuova regressione ha individuato muri a doppia faccia persi nelle scansioni ruotate quando il bordo di stampa era troppo spesso. Il riconoscitore misura ora la sezione dell’inchiostro obliquo, distingue il tratto di stampa dalla distanza fra le facce e unifica i rilevamenti sovrapposti sullo stesso tratto. Le facce oblique non abbinate restano da verificare e non vengono automaticamente certificate come assi muro. Un test sintetico controlla gli assi centrali e la misura di 20 pixel indipendentemente dal bordo di stampa.

Un ulteriore test importa un raster senza tracciati: il messaggio originale del riconoscitore viene conservato, lo sfondo può essere calibrato e salvato, e nessun muro viene inventato. La suite browser comprende così 26 verifiche mirate fra originali, varianti, importazione reale, persistenza e layout. I risultati provano i casi elencati, non la compatibilità universale: planimetrie curve, molto deteriorate, protette o ambigue richiedono gestione e verifica specifiche.

## Riproduzione

Usare Node.js >=22.13 e il runtime Python fornito da Codex, con pdfplumber/Pillow.

```powershell
python scripts/verification/plan-corpus.py --download
npm test -- src/domain/geometry/raster-lines.test.ts src/domain/geometry/plan-analysis.test.ts src/services/import/plan.test.ts
npx playwright test tests/plan-corpus.spec.ts tests/import-recognition.spec.ts tests/recognition-variants.spec.ts
```

`--regenerate` ricrea i ritagli dagli originali e aggiorna gli hash. Controllare i riferimenti se il contenuto remoto cambia. Senza i PDF scaricati, il controllo nel browser del corpus viene saltato; le regressioni sui ritagli restano disponibili offline. Per verificare il documento privato originale nella sessione locale, impostare `PRIVATE_PLAN_PDF` mantenendo le annotazioni in `tmp/plan-corpus/samuele-manifest.json`.

Il riconoscitore richiede ancora verifica su geometrie curve, scansioni molto rumorose, assi ambigui e aperture. La scala reale e le altezze restano dati da confermare. Nessun modello di apprendimento automatico è stato addestrato e non viene promessa compatibilità universale.
