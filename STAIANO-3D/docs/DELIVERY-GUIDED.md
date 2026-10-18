# Consegna Staiano 3D — 7 ottobre 2026

Modifiche applicate alla codebase locale. Il configuratore usa gli stessi oggetti persistiti in 2D, 3D e dossier; le nuove funzioni non sono semplici schermate dimostrative. La pubblicazione sul server non è stata eseguita in questo intervento. Le modifiche locali preesistenti sono state conservate e integrate.

## 1. File modificati

L'elenco completo dei file nuovi e modificati è nell'appendice. I gruppi principali sono:

| Area | File principali | Risultato |
| --- | --- | --- |
| Modello e persistenza | `schemas/project.ts`, `domain/project.ts`, `domain/project-commands.ts`, `stores/project-store.ts`, `services/project/format.ts`, `session.ts` | Schema v3, comandi condivisi, riferimenti coerenti, undo e archivi per utente |
| Import e guida | `geometry/plan-analysis.ts`, `services/import/analyze.ts`, `PlanImportWizard.tsx`, `ConfigurationWizard.tsx` | Candidati geometrici reali e percorso salvato in 11 passi |
| Quote e strutture | `geometry/dimensions.ts`, `pillars.ts`, `rescale-floor.ts`, `Editor2D.tsx`, `StructuralProperties.tsx` | Quote interne, pilastri e aggiornamento di tutti gli oggetti alla scala |
| Bocchette | `air-terminals/linear-meters.ts`, `operator.ts`, `proposal.ts`, `TerminalEditForm.tsx`, `OperatorTerminalControls.tsx` | Pezzi scelti dall'operatore, modelli misti, capacità e metri separati |
| Plenum e canali | `ducted/placement.ts`, `routes.ts`, `technical-view.ts`, `SystemMeshes.tsx`, `DuctMeshes.tsx`, `PlenumPreview3D.tsx` | Plenum per macchina, collegamenti salvati e viste tecniche numerate |
| Presentazione | `Viewer3D.tsx`, `CameraRig.tsx`, `ComfortFlows.tsx`, `comfort-fields.ts`, `DeviceMeshes.tsx` | Vista TV, tour, flussi animati e geometria parametrica |
| Cataloghi | `catalogs/split-presentation.ts`, `fan-coils.ts`, `heat-pumps.ts`, snapshot e importer | Serie commerciali, fotografie originali, prestazioni documentate e M7 |
| Idronico | `domain/hydronic/*`, `fan-coils/*`, pannelli, proprietà e mesh corrispondenti | Unità esterna fuori dalle mura e ventilconvettori collegati |
| Accesso | `server/auth.ts`, `auth-form.ts`, API accesso/sessione/cambio password, `proxy.ts`, script account | Quattro utenti personali e primo cambio password |
| Dossier | `services/pdf/dossier.ts`, `render.ts`, `download.ts`, `services/render3d/export.tsx` | Esportazione completa e sintetica, oggetti e quote aggiornati |

## 2. Funzionalità implementate

**Import e correzione.** L'analisi locale propone assi e spessori dei muri; i candidati affidabili vengono selezionati, quelli intermedi richiedono conferma. I segmenti creano muri e stanze reali. Scala, note e affidabilità sono visibili; il documento originale viene conservato nel progetto. La guida in 11 passi può essere sospesa, ripresa o percorsa liberamente e sopravvive alla riapertura.

**Quote interne e pilastri.** L'interfaccia e il dossier mostrano le lunghezze interne utili degli ambienti. I pilastri sono oggetti modificabili e persistiti; la loro superficie riduce l'area utile. Ingombri degli apparecchi, diametri nominali commerciali e assi geometrici conservano etichette distinte: un diametro nominale non viene dichiarato arbitrariamente come diametro interno certificato.

**Bocchette e scelta dell'operatore.** Minimo richiesto, proposta di distribuzione e pezzi installati sono separati. L'operatore aggiunge una bocchetta alla volta scegliendo la lunghezza, senza sovrascrivere le precedenti. Sono ammessi modelli diversi nello stesso ambiente, anche unità discrete insieme a modelli lineari. Con modelli misti la capacità deriva dai punti operativi originali; i metri equivalenti sono riferiti alla famiglia scelta e non sostituiscono i metri fisici. Deficit e dati mancanti generano avvisi senza impedire il salvataggio.

**Editing condiviso.** Posizione, rotazione, lunghezza, altezza di posa, modello, stile e finitura si modificano attraverso lo stesso progetto. Il 3D consente trascinamento e trasformazione con conferma al rilascio; il 2D si aggiorna immediatamente. Snap opzionale, distanze dalle pareti interne, blocchi e undo rimangono disponibili. La posa a parete o soffitto segue gli abbinamenti documentati del prodotto selezionato.

**Plenum e Vista Canale.** Ogni macchina ha il proprio plenum salvato, con dimensioni e posizione indipendenti. La vista frontale mostra ciascuno stacco con numero e diametro; sono disponibili vista isometrica, dall'alto e schermo intero. La canalizzazione collega gli oggetti reali, aggiorna gli estremi quando vengono spostati e conserva i punti intermedi impostati manualmente. Il dossier usa la stessa geometria tecnica e la stessa numerazione.

**Presentazione per il cliente.** La modalità TV nasconde gli strumenti di progettazione, mantiene pochi controlli e offre un tour con spostamento morbido della camera. Si possono mostrare i canali, il fabbisogno convenzionale e scegliere aria fresca, calore oppure flussi spenti. Le frecce animate partono dalle bocchette, split e ventilconvettori reali; la ripresa ha verso opposto e i radiatori mostrano convezione in riscaldamento. Sono rispettate le preferenze di movimento ridotto.

**Modelli 3D mancanti.** Gli apparecchi privi di un modello originale verificato ricevono una geometria parametrica dimensionata dai dati disponibili, con dettagli visivi per famiglia. Le foto originali completano la selezione dei prodotti. Una mesh OEM con misure discordanti resta in anteprima; non viene deformata per farla sembrare esatta. Le quote assenti richiedono dati espliciti dell'operatore.

**Cataloghi.** I nomi commerciali comprendono Daikin Sensira, Comfora, Perfera, Stylish, Emura; Mitsubishi Electric HR, AY, EF, LN; Gree Pular, New Pular, Clivia e Airy, nei modelli acquisiti. Le caratteristiche aggiuntive sono confrontate con il gradino commerciale inferiore, non con l'anno precedente. Fotografie, condizioni operative, revisioni e fonti rimangono locali e documentate. Alcuni modelli Mitsubishi hanno disponibilità regionale UK esplicita. Non si dichiara copertura universale di ogni serie esistente di ogni marchio.

Sono presenti 52 modelli di ventilconvettori Innova, Olimpia Splendid e Aermec e tre comandi originali Innova M7, con schede e compatibilità documentate. Il catalogo iniziale pompe di calore comprende tre Chaffoteaux ARIANEXT PLUS M LINK R32 e due Gree Versati V R290. Le dimensioni EDSC-C sono state recuperate dai disegni originali, mantenendo le prestazioni precedenti.

**Idronico.** Le pompe si aggiungono con tutta la loro impronta fuori dalle mura, anche dopo rotazione. È possibile modificarne la posizione e collegarle ai ventilconvettori. Percorsi idronici e punti manuali vengono salvati e riportati nel dossier. Le condizioni dell'acqua dei prodotti sono confrontate: potenze rilevate a temperature incompatibili non vengono sommate come capacità verificata.

**Accesso.** Creati `samuele`, `gionathan`, `marco` e `admin`. Password iniziali casuali individuali, cambio obbligatorio al primo accesso, hash scrypt, cookie firmati e revoca delle sessioni. Le credenziali iniziali si trovano nel file privato `.cache/initial-user-credentials.json`; non sono nel repository o nei log. Gli archivi locali sono distinti per utente; admin conserva l'archivio precedente. La gestione degli account avviene dagli script documentati in `MULTIUSER-ACCESS.md`.

**Dossier.** Il menu propone completo e sintetico. Entrambi includono la configurazione effettiva, i controlli, i metri e le viste del plenum. I campioni verificati usano due macchine, due plenum distinti, otto collegamenti, un ventilconvettore con M7 e una pompa Chaffoteaux: 28 pagine nel completo e 6 nel sintetico. Questi PDF sono esempi di verifica, non il progetto di un cliente reale.

## 3. Migrazioni

- Schema progetto v3 additivo, con migrazione dei formati v0, v1 e v2. Versioni future sconosciute vengono rifiutate esplicitamente.
- Nuovi campi e collezioni: guida, analisi import, decisioni manuali, piani lineari, plenums, canali, pilastri, ventilconvettori e impianti idronici. I riferimenti agli oggetti vengono validati e ripuliti quando cambia la topologia.
- Le macchine già confermate e i pezzi dell'operatore non vengono rimpiazzati dal ricalcolo. Una capacità insufficiente produce un avviso.
- Le revisioni precedenti dei cataloghi sono conservate; un progetto non viene reinterpretato usando una revisione nuova senza scelta esplicita.
- Il login precedente migra su admin conservandone l'hash, se già configurato; le sessioni precedenti richiedono un nuovo accesso. Gli altri utenti ricevono password personali.
- Nessuna nuova dipendenza introdotta. Il formato progetto consente fino a 128 MB per conservare originali e anteprime; il limite del documento planimetrico in ingresso resta 32 MB.

## 4. Bug corretti e pulizia Ponytail

- Un campo parete assente nel modulo bocchetta diventava la stringa `null` e impediva la conferma: normalizzato nel modulo condiviso.
- Applicare nuovamente una macchina poteva perderne la posizione; ora la scelta conserva le coordinate già assegnate quando l'ambiente rimane lo stesso.
- Modifiche a plenum, terminali, sistemi o ventilconvettori potevano lasciare riferimenti orfani: correzione al confine dei comandi e nella riconciliazione.
- Uscire dalla presentazione poteva lasciare il browser a schermo intero: uscita sincronizzata con la modalità dell'app.
- Le immagini protette dei nuovi cataloghi venivano richieste dall'ottimizzatore senza sessione: utilizzate direttamente come asset locali autenticati.
- Nell'import alcuni candidati potevano riusare identità dei segmenti originali: identità dedicate ai muri proposti.
- Dimensioni Comfora 50 e geometria EDSC-C corrette sulla base delle fonti originali.
- Capacità delle bocchette miste ricavata dal punto operativo della revisione salvata, senza fidarsi soltanto di valori derivati memorizzati.
- Consolidati modulo di modifica bocchetta e bilancio lineare condiviso tra interfaccia, validazione e PDF; rimossi calcoli e gruppi di stacchi duplicati non utilizzati.
- Riusati gli helper esistenti per conversione W/BTU; rimosso un lookup delle finiture senza chiamanti; lo schema usa le proprie costanti di versione e modalità.
- Percorsi e geometria dei plenum non vengono ricalcolati per ogni freccia animata. I flussi usano un'unica mesh di istanze; schermo intero e controlli usano funzionalità native.

L'audit ha verificato struttura, dipendenze e riferimenti nei moduli applicativi, server, servizi, importer e prove. Il controllo finale delle dichiarazioni esportate ha esaminato 275 file di codice/riferimento; ogni rimozione è stata preceduta da ricerca dei chiamanti. Le fonti, i cataloghi storici, la validazione degli ingressi e le protezioni di accesso sono stati conservati.

## 5. Test eseguiti

| Verifica | Esito |
| --- | --- |
| Suite Vitest completa | 45 file, 277 test superati |
| Flussi Edge: configurazione guidata, aggiunte, import, dossier e accesso | 13 test superati |
| Ripetizione dopo i flussi animati | 7 test guidati superati |
| Controllo aggiuntivo plenum a schermo intero | Superato: ridimensionamento canvas, centratura, numeri e diametri |
| ESLint sull'intero progetto | Superato |
| Build di produzione Next.js e TypeScript | Superata |
| PDF reali e controllo visivo | Completo 28 pagine, sintetico 6; viste e numeri leggibili |

Le prove browser rifiutano errori runtime e console inattesi. La suite locale usa una configurazione di accesso dedicata, senza sostituire gli account operativi. I contatori non includono le vecchie prove HTTPS della release precedente come se fossero state rieseguite in questa sessione.

| Test di accettazione del testo allegato | Prova |
| --- | --- |
| 1. Import → muri → stanza → guida → correzione | Analisi raster reale nel browser, conservazione originale e riapertura |
| 2. Quote interne | Test geometrici con spessori e controllo editor/dossier |
| 3. Requisito 4,2 m senza creare una bocchetta da 4,2 m | Test dominio e guida |
| 4. Pezzi 1000 + 2000 + 800 + 800 mm = 4600 mm | Browser: aggiunte esplicite, 4200 mm richiesti e margine 400 mm |
| 5. Deficit 3500 mm rispetto a 4200 mm | Test dominio e avviso nella configurazione |
| 6. Spostamento/rotazione/lunghezza dal 3D | Browser con trascinamento reale, conferma unica e undo |
| 7. Modifica dal 2D aggiorna il progetto del 3D | Browser e comandi condivisi |
| 8. Dossier con bocchette, metri e plenum | Lettura dei PDF reali con PDF.js e verifica delle viste |
| 9. Apertura progetto precedente | Migrazioni e round-trip dei formati precedenti |

## 6. Problemi e limiti ancora aperti

- Il riconoscimento raster è un'euristica per muri ortogonali leggibili. Scansioni rumorose, muri obliqui e simboli ambigui richiedono correzione manuale. I punteggi non sono probabilità calibrate. Porte e finestre non ricevono automaticamente altezze o tipologie inventate.
- Frecce, convezione, percorsi proposti e mappa fabbisogno sono illustrazioni. Non sono una simulazione CFD, una mappa della temperatura, un calcolo delle perdite di carico o un dimensionamento idraulico esecutivo.
- Il calcolo termico resta convenzionale, volume netto × 35 W/m³. Le temperature e le condizioni di targa devono essere confrontate prima della scelta finale.
- La rappresentazione parametrica permette di usare i modelli mancanti, ma non sostituisce una mesh OEM verificata o un disegno di fabbricazione approvato. Disposizione del plenum e collari sono una proposta modificabile; il diametro nominale commerciale va verificato sull'articolo ordinato.
- Alcune misure e prestazioni acustiche originali mancano: restano esplicite. Compatibilità M7 e montaggio a parete/soffitto valgono per i modelli documentati.
- I progetti appartengono all'archivio locale del browser/dispositivo e dell'utente. Non è ancora presente un archivio centrale condiviso fra TV e computer.
- Prestazioni grafiche dipendono dal browser e dalla GPU della TV; i test sono stati eseguiti in Edge sulla macchina di lavoro.
- Nessuna distribuzione in produzione eseguita con questo intervento. I cataloghi descrivono le revisioni acquisite e non garantiscono disponibilità commerciale futura.

## 7. Miglioramenti consigliati

1. Provare il tour sulla TV effettiva con un progetto cliente realistico e calibrare zoom, contrasto e densità dei flussi sul suo schermo.
2. Se occorre lavorare sullo stesso progetto da più dispositivi, aggiungere un archivio server con autorizzazioni e backup; l'accesso multiutente locale è già predisposto.
3. Se le scansioni complesse sono frequenti, acquisire un campione di planimetrie e integrare un riconoscitore dedicato, misurandone l'affidabilità.
4. Per passare al progetto esecutivo, aggiungere calcoli documentati di dispersioni, perdite dei canali e rete idraulica. La presentazione attuale resta una spiegazione visiva della configurazione.
5. Sostituire progressivamente le forme parametriche con asset OEM quando quote, licenza e corrispondenza al codice prodotto sono verificati.

## Appendice — inventario dei file

L'inventario include i file nuovi/modificati della consegna e le evidenze generate. Esclude credenziali private, cache temporanee e l'allegato locale preesistente `istruzioni apiduck.txt`. Non implica che ciascun file sia stato creato da zero in questo intervento.

<!-- FILE-INVENTORY -->

### ARCHITECTURE.md (1 file)

- [ARCHITECTURE.md](<C:/Users/Hivan/Desktop/staiano-3d/ARCHITECTURE.md>)

### catalog-data (20 file)

- [catalog-data/curation/ecoclima-geometry.json](<C:/Users/Hivan/Desktop/staiano-3d/catalog-data/curation/ecoclima-geometry.json>)
- [catalog-data/curation/split-series-extra.json](<C:/Users/Hivan/Desktop/staiano-3d/catalog-data/curation/split-series-extra.json>)
- [catalog-data/generated/ecoclima-history.json](<C:/Users/Hivan/Desktop/staiano-3d/catalog-data/generated/ecoclima-history.json>)
- [catalog-data/generated/ecoclima.inventory.json](<C:/Users/Hivan/Desktop/staiano-3d/catalog-data/generated/ecoclima.inventory.json>)
- [catalog-data/generated/ecoclima.json](<C:/Users/Hivan/Desktop/staiano-3d/catalog-data/generated/ecoclima.json>)
- [catalog-data/generated/ecoclima.previous.json](<C:/Users/Hivan/Desktop/staiano-3d/catalog-data/generated/ecoclima.previous.json>)
- [catalog-data/generated/ecoclima.report.json](<C:/Users/Hivan/Desktop/staiano-3d/catalog-data/generated/ecoclima.report.json>)
- [catalog-data/generated/ecoclima.staging.json](<C:/Users/Hivan/Desktop/staiano-3d/catalog-data/generated/ecoclima.staging.json>)
- [catalog-data/generated/fan-coils-history.json](<C:/Users/Hivan/Desktop/staiano-3d/catalog-data/generated/fan-coils-history.json>)
- [catalog-data/generated/fan-coils.json](<C:/Users/Hivan/Desktop/staiano-3d/catalog-data/generated/fan-coils.json>)
- [catalog-data/generated/heat-pumps-history.json](<C:/Users/Hivan/Desktop/staiano-3d/catalog-data/generated/heat-pumps-history.json>)
- [catalog-data/generated/heat-pumps.json](<C:/Users/Hivan/Desktop/staiano-3d/catalog-data/generated/heat-pumps.json>)
- [catalog-data/generated/split-series-presentation.json](<C:/Users/Hivan/Desktop/staiano-3d/catalog-data/generated/split-series-presentation.json>)
- [catalog-data/generated/splits-history.json](<C:/Users/Hivan/Desktop/staiano-3d/catalog-data/generated/splits-history.json>)
- [catalog-data/generated/splits.json](<C:/Users/Hivan/Desktop/staiano-3d/catalog-data/generated/splits.json>)
- [catalog-data/sources/fan-coils/aermec-fcz.pages.json](<C:/Users/Hivan/Desktop/staiano-3d/catalog-data/sources/fan-coils/aermec-fcz.pages.json>)
- [catalog-data/sources/fan-coils/innova-m7.pages.json](<C:/Users/Hivan/Desktop/staiano-3d/catalog-data/sources/fan-coils/innova-m7.pages.json>)
- [catalog-data/sources/fan-coils/manifest.json](<C:/Users/Hivan/Desktop/staiano-3d/catalog-data/sources/fan-coils/manifest.json>)
- [catalog-data/sources/fan-coils/olimpia-bi2.pages.json](<C:/Users/Hivan/Desktop/staiano-3d/catalog-data/sources/fan-coils/olimpia-bi2.pages.json>)
- [catalog-data/sources/heat-pumps/manifest.json](<C:/Users/Hivan/Desktop/staiano-3d/catalog-data/sources/heat-pumps/manifest.json>)

### docs (5 file)

- [docs/CONFIGURATOR-GUIDED.md](<C:/Users/Hivan/Desktop/staiano-3d/docs/CONFIGURATOR-GUIDED.md>)
- [docs/DELIVERY-GUIDED.md](<C:/Users/Hivan/Desktop/staiano-3d/docs/DELIVERY-GUIDED.md>)
- [docs/MULTIUSER-ACCESS.md](<C:/Users/Hivan/Desktop/staiano-3d/docs/MULTIUSER-ACCESS.md>)
- [docs/PDF-GUIDED.md](<C:/Users/Hivan/Desktop/staiano-3d/docs/PDF-GUIDED.md>)
- [docs/REQUIREMENTS-AUDIT.md](<C:/Users/Hivan/Desktop/staiano-3d/docs/REQUIREMENTS-AUDIT.md>)

### output (8 file)

- [output/pdf/staiano-guided-dossier-sintetico.pdf](<C:/Users/Hivan/Desktop/staiano-3d/output/pdf/staiano-guided-dossier-sintetico.pdf>)
- [output/pdf/staiano-guided-dossier.pdf](<C:/Users/Hivan/Desktop/staiano-3d/output/pdf/staiano-guided-dossier.pdf>)
- [output/verification/guided-client-tv.png](<C:/Users/Hivan/Desktop/staiano-3d/output/verification/guided-client-tv.png>)
- [output/verification/hydronic-outdoor-2d.png](<C:/Users/Hivan/Desktop/staiano-3d/output/verification/hydronic-outdoor-2d.png>)
- [output/verification/hydronic-outdoor-3d.png](<C:/Users/Hivan/Desktop/staiano-3d/output/verification/hydronic-outdoor-3d.png>)
- [output/verification/plenum-front.png](<C:/Users/Hivan/Desktop/staiano-3d/output/verification/plenum-front.png>)
- [output/verification/render-panorama.jpg](<C:/Users/Hivan/Desktop/staiano-3d/output/verification/render-panorama.jpg>)
- [output/verification/render.pdf](<C:/Users/Hivan/Desktop/staiano-3d/output/verification/render.pdf>)

### public (25 file)

- [public/catalog-assets/edsc-c/edsc-c-100-dimensions.png](<C:/Users/Hivan/Desktop/staiano-3d/public/catalog-assets/edsc-c/edsc-c-100-dimensions.png>)
- [public/catalog-assets/edsc-c/edsc-c-125-dimensions.png](<C:/Users/Hivan/Desktop/staiano-3d/public/catalog-assets/edsc-c/edsc-c-125-dimensions.png>)
- [public/catalog-assets/edsc-c/edsc-c-160-dimensions.png](<C:/Users/Hivan/Desktop/staiano-3d/public/catalog-assets/edsc-c/edsc-c-160-dimensions.png>)
- [public/catalog-assets/fan-coils/aermec-fcz.png](<C:/Users/Hivan/Desktop/staiano-3d/public/catalog-assets/fan-coils/aermec-fcz.png>)
- [public/catalog-assets/fan-coils/innova-m7-interface.png](<C:/Users/Hivan/Desktop/staiano-3d/public/catalog-assets/fan-coils/innova-m7-interface.png>)
- [public/catalog-assets/fan-coils/innova-sl.jpg](<C:/Users/Hivan/Desktop/staiano-3d/public/catalog-assets/fan-coils/innova-sl.jpg>)
- [public/catalog-assets/fan-coils/innova-sli.jpg](<C:/Users/Hivan/Desktop/staiano-3d/public/catalog-assets/fan-coils/innova-sli.jpg>)
- [public/catalog-assets/fan-coils/innova-sls.jpg](<C:/Users/Hivan/Desktop/staiano-3d/public/catalog-assets/fan-coils/innova-sls.jpg>)
- [public/catalog-assets/fan-coils/olimpia-bi2-air.png](<C:/Users/Hivan/Desktop/staiano-3d/public/catalog-assets/fan-coils/olimpia-bi2-air.png>)
- [public/catalog-assets/fan-coils/olimpia-bi2-smart.png](<C:/Users/Hivan/Desktop/staiano-3d/public/catalog-assets/fan-coils/olimpia-bi2-smart.png>)
- [public/catalog-assets/heat-pumps/chaffoteaux-arianext-plus.png](<C:/Users/Hivan/Desktop/staiano-3d/public/catalog-assets/heat-pumps/chaffoteaux-arianext-plus.png>)
- [public/catalog-assets/heat-pumps/gree-versati-v.png](<C:/Users/Hivan/Desktop/staiano-3d/public/catalog-assets/heat-pumps/gree-versati-v.png>)
- [public/catalog-assets/splits/daikin-comfora-official.jpg](<C:/Users/Hivan/Desktop/staiano-3d/public/catalog-assets/splits/daikin-comfora-official.jpg>)
- [public/catalog-assets/splits/daikin-emura-official.jpg](<C:/Users/Hivan/Desktop/staiano-3d/public/catalog-assets/splits/daikin-emura-official.jpg>)
- [public/catalog-assets/splits/daikin-perfera-all-seasons-official.jpg](<C:/Users/Hivan/Desktop/staiano-3d/public/catalog-assets/splits/daikin-perfera-all-seasons-official.jpg>)
- [public/catalog-assets/splits/daikin-sensira-official.jpg](<C:/Users/Hivan/Desktop/staiano-3d/public/catalog-assets/splits/daikin-sensira-official.jpg>)
- [public/catalog-assets/splits/daikin-stylish-official.jpg](<C:/Users/Hivan/Desktop/staiano-3d/public/catalog-assets/splits/daikin-stylish-official.jpg>)
- [public/catalog-assets/splits/gree-airy.png](<C:/Users/Hivan/Desktop/staiano-3d/public/catalog-assets/splits/gree-airy.png>)
- [public/catalog-assets/splits/gree-clivia.png](<C:/Users/Hivan/Desktop/staiano-3d/public/catalog-assets/splits/gree-clivia.png>)
- [public/catalog-assets/splits/gree-pular.png](<C:/Users/Hivan/Desktop/staiano-3d/public/catalog-assets/splits/gree-pular.png>)
- [public/catalog-assets/splits/mitsubishi-msz-ay.png](<C:/Users/Hivan/Desktop/staiano-3d/public/catalog-assets/splits/mitsubishi-msz-ay.png>)
- [public/catalog-assets/splits/mitsubishi-msz-ef.png](<C:/Users/Hivan/Desktop/staiano-3d/public/catalog-assets/splits/mitsubishi-msz-ef.png>)
- [public/catalog-assets/splits/mitsubishi-msz-hr.png](<C:/Users/Hivan/Desktop/staiano-3d/public/catalog-assets/splits/mitsubishi-msz-hr.png>)
- [public/catalog-assets/splits/mitsubishi-msz-ln.png](<C:/Users/Hivan/Desktop/staiano-3d/public/catalog-assets/splits/mitsubishi-msz-ln.png>)
- [public/catalog-assets/splits/official-images.json](<C:/Users/Hivan/Desktop/staiano-3d/public/catalog-assets/splits/official-images.json>)

### scripts (11 file)

- [scripts/catalog-import/ecoclima-edsc-geometry.py](<C:/Users/Hivan/Desktop/staiano-3d/scripts/catalog-import/ecoclima-edsc-geometry.py>)
- [scripts/catalog-import/ecoclima.ts](<C:/Users/Hivan/Desktop/staiano-3d/scripts/catalog-import/ecoclima.ts>)
- [scripts/catalog-import/fan-coils.py](<C:/Users/Hivan/Desktop/staiano-3d/scripts/catalog-import/fan-coils.py>)
- [scripts/catalog-import/heat-pumps.py](<C:/Users/Hivan/Desktop/staiano-3d/scripts/catalog-import/heat-pumps.py>)
- [scripts/catalog-import/split-series.py](<C:/Users/Hivan/Desktop/staiano-3d/scripts/catalog-import/split-series.py>)
- [scripts/catalog-import/split.ts](<C:/Users/Hivan/Desktop/staiano-3d/scripts/catalog-import/split.ts>)
- [scripts/configure-access.mjs](<C:/Users/Hivan/Desktop/staiano-3d/scripts/configure-access.mjs>)
- [scripts/manage-accounts.mjs](<C:/Users/Hivan/Desktop/staiano-3d/scripts/manage-accounts.mjs>)
- [scripts/verification/guided-ui.ts](<C:/Users/Hivan/Desktop/staiano-3d/scripts/verification/guided-ui.ts>)
- [scripts/verification/pdf-fixture.ts](<C:/Users/Hivan/Desktop/staiano-3d/scripts/verification/pdf-fixture.ts>)
- [scripts/verification/pdf-guided.ts](<C:/Users/Hivan/Desktop/staiano-3d/scripts/verification/pdf-guided.ts>)

### src (122 file)

- [src/app/accedi/route.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/app/accedi/route.ts>)
- [src/app/api/auth/change-password/route.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/app/api/auth/change-password/route.ts>)
- [src/app/api/auth/login/route.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/app/api/auth/login/route.ts>)
- [src/app/api/auth/session/route.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/app/api/auth/session/route.ts>)
- [src/app/globals.css](<C:/Users/Hivan/Desktop/staiano-3d/src/app/globals.css>)
- [src/configurator/Configurator.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/Configurator.tsx>)
- [src/configurator/PillarDialog.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/PillarDialog.tsx>)
- [src/configurator/editor2d/Editor2D.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/editor2d/Editor2D.tsx>)
- [src/configurator/import/ConfigurationWizard.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/import/ConfigurationWizard.tsx>)
- [src/configurator/import/PlanImportWizard.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/import/PlanImportWizard.tsx>)
- [src/configurator/properties/DeviceProperties.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/properties/DeviceProperties.tsx>)
- [src/configurator/properties/FanCoilProperties.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/properties/FanCoilProperties.tsx>)
- [src/configurator/properties/HydronicProperties.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/properties/HydronicProperties.tsx>)
- [src/configurator/properties/Properties.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/properties/Properties.tsx>)
- [src/configurator/properties/SplitProperties.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/properties/SplitProperties.tsx>)
- [src/configurator/properties/StructuralProperties.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/properties/StructuralProperties.tsx>)
- [src/configurator/properties/TerminalEditForm.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/properties/TerminalEditForm.tsx>)
- [src/configurator/properties/TerminalProperties.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/properties/TerminalProperties.tsx>)
- [src/configurator/systems/CatalogAdmin.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/systems/CatalogAdmin.tsx>)
- [src/configurator/systems/DuctPanel.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/systems/DuctPanel.tsx>)
- [src/configurator/systems/FanCoilPanel.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/systems/FanCoilPanel.tsx>)
- [src/configurator/systems/HydronicPanel.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/systems/HydronicPanel.tsx>)
- [src/configurator/systems/Models3DPanel.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/systems/Models3DPanel.tsx>)
- [src/configurator/systems/OperatorTerminalControls.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/systems/OperatorTerminalControls.tsx>)
- [src/configurator/systems/RoomAirTerminals.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/systems/RoomAirTerminals.tsx>)
- [src/configurator/systems/RoomSystems.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/systems/RoomSystems.tsx>)
- [src/configurator/systems/SplitPanel.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/systems/SplitPanel.tsx>)
- [src/configurator/systems/SupplyPlenumPanel.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/systems/SupplyPlenumPanel.tsx>)
- [src/configurator/systems/TerminalDistribution.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/systems/TerminalDistribution.tsx>)
- [src/configurator/viewer3d/CameraRig.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/viewer3d/CameraRig.tsx>)
- [src/configurator/viewer3d/ComfortFlows.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/viewer3d/ComfortFlows.tsx>)
- [src/configurator/viewer3d/DeviceMeshes.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/viewer3d/DeviceMeshes.tsx>)
- [src/configurator/viewer3d/DeviceTransform.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/viewer3d/DeviceTransform.tsx>)
- [src/configurator/viewer3d/DuctMeshes.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/viewer3d/DuctMeshes.tsx>)
- [src/configurator/viewer3d/FanCoilMeshes.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/viewer3d/FanCoilMeshes.tsx>)
- [src/configurator/viewer3d/HydronicMeshes.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/viewer3d/HydronicMeshes.tsx>)
- [src/configurator/viewer3d/LoadMap.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/viewer3d/LoadMap.tsx>)
- [src/configurator/viewer3d/PlenumPreview3D.module.css](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/viewer3d/PlenumPreview3D.module.css>)
- [src/configurator/viewer3d/PlenumPreview3D.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/viewer3d/PlenumPreview3D.tsx>)
- [src/configurator/viewer3d/ProductTools.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/viewer3d/ProductTools.tsx>)
- [src/configurator/viewer3d/SystemMeshes.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/viewer3d/SystemMeshes.tsx>)
- [src/configurator/viewer3d/Viewer3D.module.css](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/viewer3d/Viewer3D.module.css>)
- [src/configurator/viewer3d/Viewer3D.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/viewer3d/Viewer3D.tsx>)
- [src/configurator/viewer3d/comfort-fields.test.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/viewer3d/comfort-fields.test.ts>)
- [src/configurator/viewer3d/comfort-fields.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/configurator/viewer3d/comfort-fields.ts>)
- [src/domain/air-conditioning/apply.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/air-conditioning/apply.ts>)
- [src/domain/air-conditioning/refresh.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/air-conditioning/refresh.ts>)
- [src/domain/air-conditioning/split.test.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/air-conditioning/split.test.ts>)
- [src/domain/air-terminals/apply.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/air-terminals/apply.ts>)
- [src/domain/air-terminals/commercial-bom.test.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/air-terminals/commercial-bom.test.ts>)
- [src/domain/air-terminals/legacy.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/air-terminals/legacy.ts>)
- [src/domain/air-terminals/linear-meters.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/air-terminals/linear-meters.ts>)
- [src/domain/air-terminals/operator.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/air-terminals/operator.ts>)
- [src/domain/air-terminals/proposal.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/air-terminals/proposal.ts>)
- [src/domain/catalogs/air-terminal-schema.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/catalogs/air-terminal-schema.ts>)
- [src/domain/catalogs/edsc-geometry.test.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/catalogs/edsc-geometry.test.ts>)
- [src/domain/catalogs/fan-coil-schema.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/catalogs/fan-coil-schema.ts>)
- [src/domain/catalogs/fan-coils.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/catalogs/fan-coils.ts>)
- [src/domain/catalogs/heat-pump-schema.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/catalogs/heat-pump-schema.ts>)
- [src/domain/catalogs/heat-pumps.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/catalogs/heat-pumps.ts>)
- [src/domain/catalogs/radiator-finishes.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/catalogs/radiator-finishes.ts>)
- [src/domain/catalogs/split-presentation.test.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/catalogs/split-presentation.test.ts>)
- [src/domain/catalogs/split-presentation.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/catalogs/split-presentation.ts>)
- [src/domain/ducted/apply.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/ducted/apply.ts>)
- [src/domain/ducted/ducted.test.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/ducted/ducted.test.ts>)
- [src/domain/ducted/machine-plenum.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/ducted/machine-plenum.ts>)
- [src/domain/ducted/placement.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/ducted/placement.ts>)
- [src/domain/ducted/plenum-diagram.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/ducted/plenum-diagram.ts>)
- [src/domain/ducted/plenum.test.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/ducted/plenum.test.ts>)
- [src/domain/ducted/plenum.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/ducted/plenum.ts>)
- [src/domain/ducted/refresh.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/ducted/refresh.ts>)
- [src/domain/ducted/routes.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/ducted/routes.ts>)
- [src/domain/ducted/technical-view.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/ducted/technical-view.ts>)
- [src/domain/fan-coils/apply.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/fan-coils/apply.ts>)
- [src/domain/fan-coils/fan-coils.test.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/fan-coils/fan-coils.test.ts>)
- [src/domain/fan-coils/placement.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/fan-coils/placement.ts>)
- [src/domain/fan-coils/size.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/fan-coils/size.ts>)
- [src/domain/geometry/device-envelope.test.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/geometry/device-envelope.test.ts>)
- [src/domain/geometry/device-envelope.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/geometry/device-envelope.ts>)
- [src/domain/geometry/dimensions.test.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/geometry/dimensions.test.ts>)
- [src/domain/geometry/dimensions.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/geometry/dimensions.ts>)
- [src/domain/geometry/follow-walls.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/geometry/follow-walls.ts>)
- [src/domain/geometry/import-plan.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/geometry/import-plan.ts>)
- [src/domain/geometry/move-device.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/geometry/move-device.ts>)
- [src/domain/geometry/performance.test.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/geometry/performance.test.ts>)
- [src/domain/geometry/pillars.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/geometry/pillars.ts>)
- [src/domain/geometry/plan-analysis.test.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/geometry/plan-analysis.test.ts>)
- [src/domain/geometry/plan-analysis.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/geometry/plan-analysis.ts>)
- [src/domain/geometry/rescale-floor.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/geometry/rescale-floor.ts>)
- [src/domain/geometry/rooms.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/geometry/rooms.ts>)
- [src/domain/geometry/selection.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/geometry/selection.ts>)
- [src/domain/geometry/terminal-snap.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/geometry/terminal-snap.ts>)
- [src/domain/geometry/wall-commands.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/geometry/wall-commands.ts>)
- [src/domain/guided-configurator.test.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/guided-configurator.test.ts>)
- [src/domain/hydronic/apply.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/hydronic/apply.ts>)
- [src/domain/hydronic/hydronic.test.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/hydronic/hydronic.test.ts>)
- [src/domain/hydronic/placement.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/hydronic/placement.ts>)
- [src/domain/hydronic/routes.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/hydronic/routes.ts>)
- [src/domain/hydronic/validation.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/hydronic/validation.ts>)
- [src/domain/project-commands.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/project-commands.ts>)
- [src/domain/project.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/project.ts>)
- [src/domain/radiators/apply.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/radiators/apply.ts>)
- [src/domain/validation.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/domain/validation.ts>)
- [src/proxy.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/proxy.ts>)
- [src/schemas/project.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/schemas/project.ts>)
- [src/server/auth-form.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/server/auth-form.ts>)
- [src/server/auth.test.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/server/auth.test.ts>)
- [src/server/auth.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/server/auth.ts>)
- [src/services/export/device-codes.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/services/export/device-codes.ts>)
- [src/services/import/analyze.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/services/import/analyze.ts>)
- [src/services/import/plan-types.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/services/import/plan-types.ts>)
- [src/services/import/project-file.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/services/import/project-file.ts>)
- [src/services/pdf/dossier-contract.test.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/services/pdf/dossier-contract.test.ts>)
- [src/services/pdf/dossier.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/services/pdf/dossier.ts>)
- [src/services/pdf/download.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/services/pdf/download.ts>)
- [src/services/pdf/render.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/services/pdf/render.ts>)
- [src/services/project/format.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/services/project/format.ts>)
- [src/services/project/project.test.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/services/project/project.test.ts>)
- [src/services/project/session.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/services/project/session.ts>)
- [src/services/project/user-session.test.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/services/project/user-session.test.ts>)
- [src/services/render3d/export.tsx](<C:/Users/Hivan/Desktop/staiano-3d/src/services/render3d/export.tsx>)
- [src/stores/project-store.ts](<C:/Users/Hivan/Desktop/staiano-3d/src/stores/project-store.ts>)

### tests (7 file)

- [tests/guided-additions.spec.ts](<C:/Users/Hivan/Desktop/staiano-3d/tests/guided-additions.spec.ts>)
- [tests/guided-configuration.spec.ts](<C:/Users/Hivan/Desktop/staiano-3d/tests/guided-configuration.spec.ts>)
- [tests/guided-fixture.ts](<C:/Users/Hivan/Desktop/staiano-3d/tests/guided-fixture.ts>)
- [tests/import.spec.ts](<C:/Users/Hivan/Desktop/staiano-3d/tests/import.spec.ts>)
- [tests/large-project.ts](<C:/Users/Hivan/Desktop/staiano-3d/tests/large-project.ts>)
- [tests/pdf.spec.ts](<C:/Users/Hivan/Desktop/staiano-3d/tests/pdf.spec.ts>)
- [tests/realistic-project.ts](<C:/Users/Hivan/Desktop/staiano-3d/tests/realistic-project.ts>)
