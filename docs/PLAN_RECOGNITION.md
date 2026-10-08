# Verifica del riconoscimento planimetrie

Il riconoscimento `local-lines-2` usa soltanto il browser e geometria locale. Conserva fino a 2200 pixel sul lato maggiore, misura tratti pieni e coppie di facce, cerca linee oblique e preserva le alternative dei contorni attenuati in un layer da verificare. Regolarità dei retini, giunzioni, contrasto e continuità limitano i falsi muri automatici. Un punteggio euristico non certifica la destinazione architettonica di un tratto: quote e arredi possono avere la stessa geometria di un muro.

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

Ultima esecuzione nel browser sui PDF originali: Moretti 100%, Lemon 87,5%, Delbono 91,9%, UniTE residenziale 77,8%, UniTE rurale 100%. Il documento privato locale raggiunge il 75,8%. Sono percentuali di copertura dei soli riferimenti campionati, incluse le proposte da confermare, non percentuali di precisione complessiva né di muri importati automaticamente.

Il manifest contiene 40 tratti di muro annotati manualmente nei cinque campioni pubblici. Ogni tratto viene campionato in 31 punti: un punto è coperto quando un asse proposto è parallelo e dista al massimo 9 pixel dal riferimento. La regressione richiede almeno il 65% di copertura per ogni caso. Questa è una misura sui riferimenti campionati, **non precisione o richiamo globali del riconoscimento**: non sono state annotate tutte le geometrie né tutti i falsi candidati. Le proposte da verificare partecipano alla misura e non vengono per questo importate automaticamente.

Il calcolo avviene nel Web Worker già usato per i CAD, con timeout e limiti di dimensione/densità; l’interfaccia resta reattiva durante l’analisi. Le facce CAD parziali conservano i varchi, gli assi misurati si incontrano agli angoli e i layer di quote, testi, arredi e retini vengono esclusi dalle proposte automatiche.

I test sintetici verificano separatamente scansioni rumorose ruotate a 3°, 23°, 45° e 90°, assenza di duplicati, coordinate esatte degli assi, contorni di un pixel, coppie di facce con lunghezze diverse, conservazione dei varchi e assenza di stanze automatiche dai reticoli. Nel corpus, le geometrie prive di evidenza forte restano da confermare. Il test di PDF misto prova l'importazione reale di quattro muri, la persistenza e il rendering 3D. Il layout viene verificato a 1366×768, 800×900 e 390×844: pagina senza scorrimento globale e scorrimento confinato ai pannelli.

## Riproduzione

Usare Node.js >=22.13 e il runtime Python fornito da Codex, con pdfplumber/Pillow.

```powershell
python scripts/verification/plan-corpus.py --download
npm test -- src/domain/geometry/raster-lines.test.ts src/domain/geometry/plan-analysis.test.ts src/services/import/plan.test.ts
npx playwright test tests/plan-corpus.spec.ts tests/import-recognition.spec.ts
```

`--regenerate` ricrea i ritagli dagli originali e aggiorna gli hash. Controllare i riferimenti se il contenuto remoto cambia. Senza i PDF scaricati, il controllo nel browser del corpus viene saltato; le regressioni sui ritagli restano disponibili offline. Per verificare il documento privato originale nella sessione locale, impostare `PRIVATE_PLAN_PDF` mantenendo le annotazioni in `tmp/plan-corpus/samuele-manifest.json`.

Il riconoscitore richiede ancora verifica su geometrie curve, scansioni molto rumorose, assi ambigui e aperture. La scala reale e le altezze restano dati da confermare. Nessun modello di apprendimento automatico è stato addestrato e non viene promessa compatibilità universale.
