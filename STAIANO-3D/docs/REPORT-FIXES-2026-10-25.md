# Correzioni del report del 25 ottobre 2026

Riferimento: `../../REPORT.md`, working tree GitLab `main`, HEAD iniziale `cdb22a5`. Le modifiche già presenti all'avvio sono conservate. Questo verbale distingue correzioni, prove concluse e lavoro ancora aperto e registra la verifica della distribuzione locale corrente.

## Correzioni implementate

- **F03/P02, primo intervento:** parser e migrazioni estratti in `services/project/parse.ts`; il worker importa soltanto schema e parser. Il ricalcolo resta nel percorso principale dopo la decodifica. API sincrone di formato conservate. Il metafile esbuild impedisce di reintrodurre cataloghi nel worker.
- **F04/P11:** GET dell'archivio legge lo snapshot pubblicato con rename atomico, senza lock o riscrittura. Le mutazioni mantengono lock, lease, revisioni e scrittura atomica.
- **F05/P11:** indisponibilità dell'archivio condiviso distinta da elenco vuoto, progetti locali accessibili, messaggio persistente e Riprova. Nessuna cache condivisa presentata come aggiornata.
- **F06/P06:** velocità `Q/(3600×area)` sui soli rami a portata univoca; limite applicato soltanto allo SKU/diametro OEM. Più tubi restano indeterminati. Perdita distribuita e totale di rete incompleto distinti.
- **F07/P03:** conteggi tecnici per famiglia con denominatori espliciti, fonti/revisione/pagina/hash, geometria risolta e prezzo separati. Stato del terminale riportato anche nei dossier completo e sintetico. Nessuna promozione dei punti in revisione.
- **P05:** coordinate testuali raccolte in Coordinate avanzate; modifica 3D primaria.
- **P07:** struttura, colmo, finito, fasce, vuoto e volume nel passo Stanze.
- **P08:** scelta Nuova controparete/Fronte già disegnato, profondità positiva, anteprima area/volume del lato selezionato. Schema firmato e doppio lato conservati.
- **P09:** Mostra nel progetto dalla guida, proprietà dell'oggetto, ritorno alla fase precedente senza modificare le conferme. Un controllo del tubo seleziona il tubo stesso. Guida completata distinta da progetto verificato.
- **P10:** ingresso apparecchi unico sugli strumenti esistenti: canalizzato, radiatore, fan-coil, split, VRV e PdC.
- **P04/P05, regressione aggiuntiva riprodotta:** gli auto-incroci dei flessibili lunghi potevano cadere tra campioni. Distanza tra segmenti sui rettilinei; archi discretizzati con freccia massima 1 mm e margine conservativo. Geometria della curva e misura restano uniche. Distanza condivisa estratta senza cambiarne l'interfaccia.
- **P04/P13, regressione aggiuntiva riprodotta:** uno stacco spostato su altra faccia poteva conservare il prezzo del plenum OEM. Anche gli override per singolo stacco partecipano ora alla compatibilità commerciale; variante diversa quotata separatamente.
- **P04:** matrice endpoint estesa a sei facce × tre rotazioni × due quote.
- **Licenza, modifica approvata esplicitamente dall'utente:** un nuovo adattatore virtuale cambiava il MAC selezionato nonostante l'adattatore della licenza fosse ancora presente. Il server riconosce il token firmato soltanto con stesso host, identificativo del sistema e uno dei MAC tuttora presenti. Firma, prodotto, scadenza e verifica server conservati. Rinnovo sulla stessa postazione registrata, senza consumare un nuovo posto.
- **P14, launcher (modifica approvata esplicitamente dall'utente):** l'EXE sceglie un MAC ancora presente sulla stessa postazione Windows e usa l'identificativo firmato salvato se l'adattatore è ancora collegato. Il download usa l'identificativo del manifest firmato dopo la verifica nonce/firma. `active.json` conserva l'hash precedente e la pulizia mantiene la versione di rollback; l'installer registra il rollback esistente.
- **P14, installazione locale:** build `6JpHgTFcRmMtDX1dUiAG3`, SHA-256 `3b59fc2d23bf4a395fd711eec2d821af87f26ffafcf070c049d8a185bcfee30f`, installata tramite l’attività `Staiano HVAC Update`; servizio `Running`, `/accedi` HTTP 200 con header concorde, licenza `active`, rollback `APOSavOxDSuJVV4dYCcXB` conservato.
- **P14, verifica documenti installati:** hash indipendente trova tutti i 547 documenti del manifest nella cartella dati. L’EXE installato segnalava ancora 8 schede LG mancanti perché confrontava gli hash in modo sensibile alle maiuscole e conservava una cache obsoleta; corretto il confronto e versionato il fingerprint della cache. Test launcher 8/8.
- **P14, release GitLab:** commit `5ae3ab161480e324cbc4ade04ed2649c3244b32a` su `origin/main`; release EXE `6JpHgTFcRmMtDX1dUiAG3`, 275.890.176 B, SHA-256 `3b59fc2d23bf4a395fd711eec2d821af87f26ffafcf070c049d8a185bcfee30f`, `dirty: false`. Pacchetto caricato su GitLab e registrato nel canale aggiornamenti. È stato installato qui tramite updater; documenti catalogo 547/547, zero mancanti, istruzioni rimosse.
- **P02, archivi catalogo:** gli storici sono asset immutabili indirizzati per hash e caricati soltanto per le revisioni degli apparecchi installati. Il browser verifica SHA-256, deduplica richieste e consente retry; importazione offline fallita mantiene il progetto aperto. Gli asset vecchi restano disponibili per build già aperte.
- **P12/P13, gruppo SketchUp:** tutte le superfici generate per ciascun muro condividono un unico gruppo SketchUp `Muro N`, comprese le parti di contropareti e i materiali separati.
- **P13, export SketchUp:** i pezzi dei muri ora entrano direttamente nello stesso gruppo, con materiale applicato alle facce; il bridge rifiuta sottogruppi interni al muro. Verifica con SketchUp 2026: due mesh colorate, un gruppo `Muro 1`, zero gruppi figli.
- **P13, dossier:** mantenuta la panoramica per piano e aggiunto un render per ogni stanza su tutti i piani, anche quando l’export parte con un ambiente selezionato. Le viste stanza usano il renderer 3D esistente.
- **P12, ventilconvettori:** proprietà e dossier dichiarano ora che corpo/griglie 3D sono schematici e chiedono di verificare attacchi e spazi di manutenzione sulla scheda OEM; le quote restano quelle catalogo disponibili.
- **Render 3D, porte:** soglia pavimentata con finitura del pavimento copre la luce della porta per tutto lo spessore del muro, così il terreno esterno non è visibile sotto il vano.
- **P13, E2E:** il controllo richiede una pagina per stanza in entrambi i dossier e salva gli artefatti sotto `.cache/report-fixes`, senza sovrascrivere PDF preesistenti in `output/pdf`.
- **Catalogo LG split/multisplit:** 37 modelli a parete, 2 cassette quadrate e Round Cassette UT36F; 13 combinazioni verificate e 22 schede di presentazione con immagini OEM. Oltre alle cinque famiglie multisplit del leaflet LG Greece 2021, aggiunti i kit monosplit italiani DUALCOOL AI Deluxe H09/H12/H18/H24 e Premium H09/H12 con capacità e dimensioni per unità interna/esterna dalle pagine LG Italia archiviate. Le sei schede HTML hanno hash verificati e i relativi kit sono selezionabili dal dimensionamento automatico. Le capacità per stanza non pubblicate nelle combinazioni multisplit restano escluse dall’autodimensionamento. Il Round è montabile a soffitto e circolare in pianta e nel render.
- **P02, misura corrente:** il worker progetto è 482.480 byte; il metafile esclude cataloghi e storici. Profiling sulla stessa fixture: cold start 48 ms, heap 9.888.448 B, picco RSS 66.330.624 B. La misura precedente di 93.428.233 byte era un bundle pre-fix.

## Audit P12 delle famiglie prioritarie

| Famiglia                                     | Evidenza verificata                                                                                                                                                                                                     | Confine dichiarato                                                                                                             |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| EDLS, EDFL, EDSC-C, EGA6                     | Facce/ingombri e distacchi usano dati per variante; EDSC-C conserva disegni OEM con hash; attacchi plenum ammessi e distinta sono coperti da test di geometria, connessione e BOM.                                      | Prestazioni acustiche o profondità assenti restano “da verificare”; le varianti `review` non diventano valide per somiglianza. |
| Ventilconvettori incasso                     | AirLeaf SLI mantiene la faccia a 2 mm dal filo muro; cassaforma, pannello, comando e scheda compaiono separati in proprietà/distinta. Il test UI/PDF finale passa; corpo e griglie sono dichiarati schematici.          | Attacchi e manutenzione si verificano sulla scheda OEM; nessun dettaglio grafico vale come istruzione di posa.                 |
| Canalizzati e plenumi                        | Apertura, luce, flangia e profondità collare hanno campi distinti; dati supplementari non retroagiscono sulle prestazioni storiche. Test verificano attachment, rotazioni, facce e flessibili sulla stessa curva.       | Se il disegno manca, il collare resta non dichiarato; non si centra il tubo nel corpo come sostituto.                          |
| Radiatori Ardesia                            | Il progetto usa profili di sezione misurati per passo/colonne e conserva inviluppo da catalogo; le 18 mesh complete hanno avviso in UI e restano anteprima/download. Test browser controlla misura, warning e download. | OBJ/GLB e STEP ufficiali REV00 non coincidono: nessun taglio, scala o promozione a geometria verificata.                             |
| Split, PDC, VRV e radiatori fissi/schematici | Quote pubblicate e indicative restano distinte; le proprietà espongono la nota quando l’ingombro non è pubblicato o la geometria è schematica.                                                                          | Attacchi e distanze di servizio non vengono inferiti da una serie simile.                                                      |

Questo audit chiude l’avvertenza di fedeltà richiesta dal report sulle famiglie esaminate; non certifica fabbricazione o copertura OEM dell’intero catalogo.

## Prove concluse

| Prova                                                            | Risultato                                                                                     |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Archivio server e route, permessi/concorrenza                    | 5/5 test                                                                                      |
| Importazione, revisioni, archivio offline, velocità              | 63/63 test in 6 file                                                                          |
| Qualità dati, dossier e controlli                                | 25/25 test in 3 file                                                                          |
| Facce, routing, collisioni, flessibili, distinta, controsoffitti | 116/116 test in 6 file                                                                        |
| Licenza/token, seguito da integrazione cambio adattatore         | 31/31; poi 21/21 nel file licenza aggiornato                                                  |
| Browser cartongesso e wizard                                     | 8/8; positivo/negativo, due lati, ripresa passi, desktop/tablet e viewport piccoli            |
| Browser archivio, catalogo e ingresso radiatore                  | Passati                                                                                       |
| Browser guida → proprietà → ritorno alla fase                    | Passato                                                                                       |
| E2E completo su build precedente                                 | 234 passati, 9 falliti, 8 saltati (corpus OCR assente), 21,2 min                              |
| E2E completo dopo le correzioni                                  | 243 passati, 8 saltati, 0 falliti, 19,1 min su Next dev (`127.0.0.1:4027`)                    |
| E2E finale dopo LG, immagini e timeout OCR                        | 245 passati, 8 saltati, 0 falliti, 13,2 min con 2 worker su Next dev isolato (`4027`)         |
| Trascinamento reale maniglia X 3D                                | 3/3 ripetizioni; invalidazione del proxy con `frameloop="demand"`                             |
| Suite unit completa dopo le correzioni e i nuovi helper          | 138 file, 892 test passati                                                                    |
| Suite unit completa corrente                                     | 138 file, 895/895 passati; `vitest run --maxWorkers=4`                                         |
| Build Next separata dopo gli ultimi cambi                        | Passata in `.next-update`                                                                     |
| Typecheck completo                                               | Passato con heap 4 GB                                                                         |
| ESLint completo                                                  | Passato dopo gli ultimi cambi                                                                 |
| Unit test mirati dopo gli ultimi cambi                           | 34/34 in catalogo stufe, licenza, launcher e qualità terminali                                |
| Manifest fonti                                                   | Allineato a 547 documenti; 547/547 archiviati                                                |
| Archivi storici catalogo                                         | Browser: hash verificato, lazy-load e retry; test unitari e 2 E2E passati                     |
| Launcher EXE: fingerprint, manifest, hash e conservazione della versione precedente | 8/8 test mirati; coprono la pulizia in cartella temporanea, non il cambio dell’attività Windows |
| E2E dossier e export SketchUp                                    | 2/2; render per stanza e SKP reale                                                            |
| Cataloghi Ardesia/terminali prioritari                           | 28/28 test in 4 file                                                                          |
| Build Next separata                                              | Passata: `.next-update`, `hzSExP3iliQlZn66kLtsZ`                                              |
| Build Next dopo export SketchUp, soglie e render stanza          | Passata: `.next-update`, `QSUMdiYkkOtbY5KAAlYv1`                                              |
| Build Next dopo helper e controlli mirati                        | Passata: `.next-update`, `YltHvm9YsfFslCZ7T_-DN`                                              |
| Build Next corrente                                              | Passata: `.next-update`, `x8MvHg6Nhihd2Q849PdJj`                                              |
| Test soglia, panoramiche, geometria e dossier                    | 24/24 in 4 file                                                                               |
| EXE locale                                                       | 274.846.208 B, SHA-256 `ffcd7571…b994349`, `--version` concorde con `release.json`            |
| EXE intermedio prima della nota P12                              | build `x8MvHg6Nhihd2Q849PdJj`, 274.849.280 B, SHA-256 `855c40b5…ef0aa0f`                      |
| Build finale P12                                                 | Passata: `.next-update`, `EQepMIFhcqfZLYG5xXMxu`                                              |
| EXE finale P12                                                   | 274.844.672 B, SHA-256 `76fed2f4…12ca2fd4`; `--version`, hash e manifest concordi             |
| EXE locale aggiornato con le presentazioni LG                     | `xa7Fk1a1IYRLIcTzlMhnS`, 275.886.080 B, SHA-256 `ef8d25e98058202180176d9bec53c821a416a941b4b4ac965506e7f2ea83268f`; `--version` concorde, non installato |
| Header HTTP finale `/accedi`                                     | HTTP 200; `X-Staiano-Build` = `EQepMIFhcqfZLYG5xXMxu`                                         |
| E2E finale P12/P13                                               | Build produzione: nota fan-coil, dossier completo/sintetico e SKP, 3/3                        |
| Anteprima Ardesia in revisione                                   | Build produzione: warning dimensionale, anteprima/download soltanto, 1/1                      |
| Smoke EXE locale finale                                           | Gate versione remoto superato; build `xa7Fk1a1IYRLIcTzlMhnS`; server su 4029, `/` HTTP 303 verso licenza mancante, `/licenza` HTTP 200; dati temporanei isolati |
| Dossier fan-coil                                                 | 15/15 test; disclaimer geometria schematica presente nella distinta                           |
| Avvio EXE precedente (build `YltHvm9YsfFslCZ7T_-DN`)             | Non completato allora: `/updates/version` falliva con `fetch failed`; nessun listener rimasto |
| Licenza reale sulla nuova build, porta 4015                      | HTTP 200, `active`, controllo attivo                                                          |

I conteggi dei test sono prove di run distinti, con sovrapposizioni; non vanno sommati come test unici.

## Misure worker

Processi Node distinti, stessa fixture `realistic-home.hvacproj`, nessuna misura di rete o iPad fisico. Il dato riguarda il worker, non il tempo complessivo di apertura del progetto: il ricalcolo si svolge nel chiamante.

| Misura                        |         Prima |         Dopo |
| ----------------------------- | ------------: | -----------: |
| Bundle                        |  93.428.233 B |    482.480 B |
| Avvio e decodifica del worker |      2.082 ms |        48 ms |
| Heap osservato alla risposta  | 260.923.712 B |  9.888.448 B |
| Picco RSS del processo        | 909.217.792 B | 66.330.624 B |

Riproduzione: `node scripts/profile-project-worker.mjs <bundle-prima> public/workers/project.worker.js`. Metafile: `.cache/browser-workers-meta.json`.

## Lavoro ancora aperto

- **P01:** suite E2E finale: 245 passati, 8 saltati, 0 falliti. Gli skip riguardano test admin/ricostruzione non abilitati e il corpus OCR pubblico opzionale. Suite unit: 138/138 file, 895/895 test dopo il fix delle presentazioni LG; flusso split: 3/3. Typecheck, ESLint e build Next passati.
- **P13:** dossier/export SKP (2/2), soglia Render 3D (1/1), trascinamento X 3D (3/3) e suite E2E completa passati; bridge collaudato con SketchUp 2026. L’E2E è stato eseguito su Next dev, non sulla build destinata all’installazione.
- **P12/P13:** campione prioritario e disclaimer per livello geometrico verificati nella matrice sopra; l’intero catalogo e i dettagli OEM non pubblicati non sono certificati. Il ventilconvettore avverte in proprietà e dossier; il campione UI/PDF/SKP finale è passato 3/3.
- **P12, Ardesia:** i 18 OBJ/GLB ufficiali hanno tutti larghezza misurata del GLB superiore di 9,2 mm al valore nominale registrato. Nel campione H1800/10 elementi i gruppi degli elementi coprono 0–460 mm, i gruppi terminali del corpo circa −10,1–470,1 mm, e gruppi accessori arrivano a −23,1 mm. Tutti i 18 OBJ hanno gruppi numerici senza nomi e referenziano un MTL non archiviato: la semantica delle protrusioni non è dimostrata. Il catalogo 3D dichiara già in UI che queste mesh sono solo anteprima e non ingombro tecnico; `tests/models3d.spec.ts` verifica warning, dimensioni misurate e download. Le 18 voci restano `review`.
- **P12, confronto CAD Cordivari:** la [pagina ufficiale Ardesia 2 colonne](https://www.cordivari.it/prodotto/radiatore-tubolare-ardesia-2-colonne/) pubblica DWG, OBJ e STEP REV00 per sei taglie. Ho scaricato e misurato i sei STEP locali: larghezza dell’assemblaggio 484,6 mm per L=460, 714,6 per L=690, 1174,6 per L=1150; è costante L+24,6 mm, contro la quota di corpo `L+24` della [scheda tecnica 2025, pagina 2](https://www.cordivari.it/wp-content/uploads/2023/10/IT-Cordivari_TEC_Scheda-tecnica-tubolare-Ardesia-2-colonne_R25-2025.pdf), SHA-256 `e0ccd69c926daddc0eb6a860f99a948b63ef9aae5f7770854a6ae59a68c16d12`. L’assemblaggio STEP 460×1800 include anche geometrie fino a 1902,616 mm in altezza e 158,616 mm in profondità; non sono state attribuite a un accessorio specifico. Per 460×1800 il GLB convertito dall’OBJ misura 493,2 mm, 8,6 mm oltre l’inviluppo STEP. Le fonti ufficiali non concordano: tutte le mesh restano anteprima `review`, senza tagli o scale. Hash e misure dei sei STEP sono in `.cache/report-fixes/ardesia-oem-460-1800/step-measurements.json`.
- **P13, ultime modifiche:** dossier completo/sintetico con render per stanza e export SKP passati (2/2). Soglia Render 3D passata (1/1). Bridge verificato con due facce colorate nello stesso gruppo `Muro 1`, senza sottogruppi.
- **P14:** sorgente `5ae3ab161480e324cbc4ade04ed2649c3244b32a` su GitLab main; suite `npm test` 895/895; release EXE `6JpHgTFcRmMtDX1dUiAG3` pubblicata su GitLab e registrata nel canale aggiornamenti, poi installata tramite updater. Build ID, hash, task e header HTTP concordano; licenza attiva; manifest installato 547/547, nessun documento mancante e nessun file istruzioni residuo. Il rollback `APOSavOxDSuJVV4dYCcXB` resta presente.
- **P14, rollback:** `active.json` dichiara la versione precedente `ef8d25e98058202180176d9bec53c821a416a941b4b4ac965506e7f2ea83268f`, presente nella cartella `versions`; il rollback dopo un avvio fallito non è stato forzato in produzione.
- **Build dopo immagini LG:** `npm run exe:build` riuscita in `.next-update`, ID `xa7Fk1a1IYRLIcTzlMhnS`; il server di produzione e l’EXE installato non sono stati toccati.
- **E2E LG:** `LG Standard Plus a parete è configurabile e persiste` passa 1/1 su Next dev isolato, porta 4027. Verifica la lista delle 37 unità, il kit AI Deluxe H18 configurabile e le quote dell’unità esterna; il Round UT36F resta coperto dal test di persistenza e simbolo circolare.
- **Fonti catalogo:** confronto SHA-256 normalizzato senza distinzione maiuscole/minuscole; test mirato 6/6, archivio 547/547 senza documenti mancanti.

Log e immagini locali: `.cache/report-fixes/`. Le prove precedenti del report restano storiche e non certificano questa versione.
