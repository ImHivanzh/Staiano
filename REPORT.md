# Staiano3D — audit e piano operativo

**Data:** 25 ottobre 2026, Europe/Rome. **Base:** working tree GitLab `imhivanzh/Staiano3D`, HEAD `cdb22a5`, già ampiamente modificata all’avvio. I percorsi sotto sono relativi a `STAIANO-3D/`. I percorsi applicativi abbreviati `domain/`, `services/`, `workers/`, `configurator/` e `server/` sottintendono `src/`; i nomi senza cartella identificano i moduli della mappa seguente.

Questo è il riferimento corrente dell’audit. `VERIFICATION.md` e `docs/AUDIT-2026-10-23.md` conservano prove datate, che non certificano automaticamente una build successiva.

**Attuazione successiva:** correzioni, misure, verifiche e requisiti ancora aperti sono registrati in [STAIANO-3D/docs/REPORT-FIXES-2026-10-25.md](STAIANO-3D/docs/REPORT-FIXES-2026-10-25.md). Le sezioni sottostanti conservano lo stato e il piano originali dell'audit.

## 1. Esito

La base è ampia: editor metrico, cataloghi versionati, posa, viewer 3D, salvataggio locale/condiviso e dossier. La priorità è rendere coerenti dati tecnici, geometria e percorso operativo. Un render più dettagliato non corregge una quota mancante.

Ordine raccomandato:

1. Chiudere regressioni e gate, ridurre il peso degli storici nei bundle.
2. Usare la stessa geometria per collari, percorso, collisioni, lunghezze ed export.
3. Definire controsoffitti e contropareti prima di distribuire gli impianti.
4. Distinguere affidabilità di prestazioni, geometria e prezzo per modello.
5. Collegare guida, controlli e oggetti senza costringere l’operatore a cercarli di nuovo.

### Correzioni di questo passaggio

- Controllo verticale dei canali sotto tetto inclinato: usa ora la quota locale del tetto, non solo l’altezza alla gronda.
- Messaggio del raggio dei flessibili: usa lo stesso minimo del motore, legato a prodotto e diametro.
- Fixture ETF10: prova effettivamente R=48 mm, anziché concedere 96 mm e aspettarsi 48 mm.
- Fixture di salvataggio bocchetta a parete: usa EDLH, ammessa a parete; non forza EDLS su un montaggio incompatibile.
- Corretti tre problemi di typecheck nella working tree: guardia del catalogo precedente, `coverType` nel candidato di posa ventilconvettore, accesso opzionale nel test browser.
- Eliminati `ROADMAP.md` e `CONTINUATION.md`, duplicati con stato superato.

Le precedenti modifiche estese su cataloghi, mesh, sei facce dei plenum e schema 11 erano già presenti. Sono state analizzate come stato corrente, senza attribuirle tutte a questo passaggio.

## 2. Copertura e metodo

Sono stati censiti tutti gli snapshot attivi, separandoli da staging, revisioni precedenti e storici. Analisi approfondita di cataloghi/contratti, selezione, posa, flessibili, plenum, tetti, fasce, cartongesso, ingombri, persistenza e output. Letti anche salvataggio condiviso, importazione, generazione worker e procedure di distribuzione.

Inventario sorgenti: 422 file TS/TSX sotto `src`, inclusi 133 file di test; 87 file `.spec.ts` sotto `tests`. Revisione trasversale orientata ai rischi: non è una lettura certificata di ogni riga o un confronto manuale delle 541 fonti correnti.

Carico assunto: pochi operatori su PC/iPad, più impianti per progetto. La fixture prestazionale usa 200 muri, 50 stanze e 100 apparecchi; non si assume un servizio pubblico con migliaia di utenti.

| Evidenza | Dimostra | Non dimostra |
|---|---|---|
| Snapshot/inventario | Contenuto importato e stato dichiarato | Copertura dell’intera gamma OEM |
| Fonte con hash | Identità del documento acquisito | Correttezza di ogni trascrizione |
| Schema Zod | Contratto e vincoli dei dati | Verità fisica di un valore plausibile |
| Test | Comportamento nei casi provati | Assenza di ogni difetto |
| Browser | Flusso sulla versione provata | Correttezza di una build diversa |
| Mesh procedurale | Rappresentazione delle quote disponibili | Equivalenza al CAD OEM |

Nessun grafo Graphify preesistente: analisi diretta con ricerca, codice, snapshot e test. Nessun grafo generato viene presentato come ulteriore prova.

## 3. Mappa dei flussi da conservare

| Flusso | Codice da riusare | Vincolo |
|---|---|---|
| Importazione | `services/import/project-file.ts`, `workers/project.worker.ts`, `services/project/format.ts` | File invalido non sostituisce il progetto corrente; migrazioni additive |
| Disegno | `configurator/editor2d`, `domain/geometry` | Metri nel dominio, scala confermata, apertura proposta distinta da misurata |
| Cataloghi | `domain/catalogs`, `scripts/catalog-import`, `catalog-data/generated` | Revisione storica e condizioni di prova preservate |
| Posa | `domain/air-terminals`, `ducted`, `fan-coils`, `air-conditioning` | Montaggio/accessori compatibili; bozze escluse dai risultati |
| Vuoti tecnici | `geometry/ceilings.ts`, `drywall.ts`, `drywall-sides.ts` | Quota struttura/finita e lato stanza distinti |
| Flessibili | `ducted/routes.ts`, `flexible-curve.ts`, `attached-plenums.ts`, `collisions.ts` | Collari reali, tangenti, raggio, volume del tubo e punti salvati |
| Controlli | `domain/validation.ts`, `resolveCheckTarget` | Stesso problema nell’editor, nella guida e nel dossier |
| Salvataggio | `services/project`, `server/project-sharing.ts` | Revisioni, conflitti, copia recuperabile e lock |
| Output | `services/pdf`, `services/export`, `render3d/sketchup-geometry.ts` | Quote e distinta coerenti; importi ignoti espliciti |

La separazione fra dominio e React è utile. Non emerge necessità di cambiare stack o introdurre un secondo motore geometrico.

## 4. Cataloghi: censimento completo degli snapshot attivi

I conteggi vengono dai JSON presenti. Un record di prodotto non coincide sempre con una singola combinazione commerciale acquistabile.

### 4.1 Radiatori

| Snapshot | Record | Geometria dichiarata | Verifica da completare |
|---|---:|---|---|
| `cordivari.json` | 135 | Campo storico non esplicitato | Passo, elementi, maggiorazione larghezza; confronto CAD separato |
| `global.json` | 19 | Campo storico non esplicitato | Famiglia, interassi, accessori e finiture ammesse |
| `cordivari-comfort.json` | 61 | 61 `published` | Costruzione fissa, quote e resa della variante |
| `cordivari-range.json` | 473 | 473 `schematic` | Sostituzione progressiva delle sagome con famiglie quotate |
| `zehnder.json` | 188 | 188 `published` | Differenze fra serie e collegamenti; non implica mesh OEM |
| `lazzarini.json` | 63 | 55 `schematic`, 8 `published` | Finiture con rese proprie e varianti effettivamente documentate |
| **Totale** | **939** | Nessun ID duplicato fra i sei snapshot | Il vecchio conteggio 466 è superato |

Accessori: 206 finiture e cinque sezioni geometriche; foto di famiglia non certificano taglia/finitura. La larghezza a elementi deriva da passo, conteggio e aggiunta documentata: l’assenza del campo letterale `widthMm` non è un errore. I prodotti fissi seguono un contratto diverso.

Conservare resa e temperatura di riferimento, esponente e provenienza, interassi, limiti di pressione/temperatura, larghezza totale, finiture e accessori. I report Cordivari/Global riportano 135/19 warning: non equivalgono automaticamente a 154 errori di prodotto.

### 4.2 Ecoclima

| Gruppo | Contenuto | Stato e limite |
|---|---|---|
| Terminali | 127 famiglie, 1.778 varianti, 6.788 punti | 6.252 punti `valid`, 536 `review`; 273 varianti senza punti |
| Acustica | 612 punti senza valore né limite superiore del rumore | Non interpretarli come silenziosi o adatti all’autoselezione con vincolo acustico |
| Inventario | 109 voci | 37 tabelle verificate, 39 parziali, 9 prestazioni in attesa, 12 soli modelli, 12 fuori ambito |
| Prezzi | 6.745 righe, 873 specifiche accessori | Il vecchio conteggio 6.718 è superato; completezza commerciale distinta da tecnica |
| Mapping prezzi | 127 righe, 15 famiglie non mappate | Nessuna corrispondenza commerciale va inventata |
| Commerciale dedicato | 9 famiglie | Regole più ricche soltanto per il perimetro supportato |
| Finiture terminali | 36 voci | Compatibilità per famiglia/revisione |
| Flessibile | ETF10, 15 diametri, 154 punti di perdita | Dati applicabili solo al prodotto/diametro corrispondente |

Inventario delle pagine e `selectionStatus` delle 127 famiglie hanno denominatori diversi. Non sommarli come un’unica classificazione.

960 varianti non hanno entrambi gli override `faceWidthMm`/`faceHeightMm`, e 1.539 non hanno `bodyDepthMm`. Questi sono conteggi dei campi, non necessariamente delle geometrie irrisolvibili: vanno considerati i fallback su dimensioni base, lunghezza commerciale e configurazione. Misurare la geometria risolta, non soltanto i campi nulli.

Il report listino contiene 58 segnalazioni: 6 prezzi malformati/non pubblicati, 23 topologie da normalizzare, 9 maggiorazioni finitura separate dal base, 20 differenze HTML/workbook. La precedente ambiguità ERDR/EVALI è stata lavorata distinguendo diametro e campo di portata; non riproporla come identico difetto senza confrontare le chiavi aggiornate.

ETF10 pubblica R=0,6×diametro, 20 m/s e 2.000 Pa. Diametri 102/127/152 non equivalgono automaticamente ai nominali 100/125/150. L’app usa punti esatti per le perdite distribuite; niente interpolazioni, perdite raccordi o interasse sostegni inventati. [Scheda ufficiale, rev. 01/2024](https://www.ecoclima.com/attach/Scheda%20tecnica%20ETF10%20rev%201-2024/attachment-translations/scheda-tecnica-et-f10-rev-1-2024_it.pdf).

### 4.3 Macchine e altri cataloghi

| Catalogo | Record attivi | Controllo tecnico prioritario |
|---|---|---|
| Canalizzati `hvac.json` | 21: 7 Mitsubishi, 7 Daikin, 7 Gree | Involucro, luce attacco e flangia distinti; massima portata diversa dal nominale |
| Ventilconvettori | 123: 35 Innova, 22 Olimpia, 66 Aermec; 3 comandi | Corpo/cassaforma/pannello/kit separati; montaggio specifico per variante |
| Pompe di calore | 61: 11 Chaffoteaux, 32 Daikin, 18 Gree | Quote, attacchi, spazio di servizio e condizioni di prova |
| Split | 110 interne (LG: 37 a parete, 2 cassette quadrate, 1 circolare), 91 esterne, 2.459 combinazioni | Abbinamento, mercato/revisione, capacità simultanee; i sei kit LG DUALCOOL AI monosplit italiani sono dimensionabili con fonti archiviate. Le combinazioni multisplit senza capacità per stanza restano escluse dall’autodimensionamento. |
| VRV | 18 esterne, 7 interne | Non è l’intera gamma interna OEM; rapporto connessione distinto da capacità garantita |
| Presentazioni split | 22 schede di serie | Include immagini ufficiali per le famiglie LG a parete e DUALCOOL AI; orientamento, non sostituzione della combinazione selezionata |
| Stufe tecniche | 170 | Consultazione; posa richiede connessioni e distanze specifiche |
| Mesh Cordivari | 18, tutte `review` | Anteprima/download; non ingombro verificato |

Nessun duplicato interno degli ID nelle collezioni principali censite. Accessori e schede di presentazione non sono stati sommati ai prodotti termici.

### 4.4 Casi già lavorati e limiti ancora visibili

- Innova AirLeaf: tradizionale/RASOMURO, pannelli/cassaforme per taglia e scheda di comando. RSI/SLSI non sono semplici alias di SLI. [Scheda ufficiale](https://www.innova.it/site/assets/files/2792/airleaf-sli-rsi-slsi_scheda_tecnica.pdf), [indice manuali](https://www.innova.it/docs/manuali/airleaf/manuali-dinstallazione-it/).
- Olimpia Bi2 Naked: cassaforma/pannello distinto dai kit griglie e dalla chiusura realizzata in cantiere; profondità di posa legata al kit.
- Aermec FCZ P: MZA/MZU selezionabili e in distinta; il frontale non quotato non riceve misure certificate inventate.
- Ecoclima EMV: assi B/H corretti nelle sette varianti S/J; la geometria non compensa prestazioni acustiche assenti.
- EVVAIR/EGA50: quote di faccia per variante/codice; profondità non pubblicate rimangono sconosciute.

## 5. Difetti, rischi e limiti ordinati

### F01 — Corretto: falso avviso di quota sotto il colmo

**Caso:** waypoint a 3,5 m, sotto un colmo di 4 m ma sopra l’altezza alla gronda. `validateProject` produceva `ductEnvelope` usando sempre `room.heightM`.

**Intervento:** riuso di `roofHeightAt` in `domain/validation.ts`. Nessun cambiamento a schema, punti salvati o quote finite. Le collisioni continuano a verificare l’ingombro del tubo.

**Prova:** test in `ducted/routes.test.ts`: nessun avviso sotto il colmo, stesso esito dopo export/import, quota 4,1 m segnalata. Falliva prima della correzione.

### F02 — Corretto: messaggio del raggio incoerente con lo SKU

**Caso:** ETF10 Ø160 non realizzabile; il motore applicava il minimo OEM ma il messaggio prescriveva sempre R≥D.

**Intervento:** stesso helper del motore, `flexibleDuctMinimumRadiusFactor`, anche nel messaggio. Prove sui valori OEM e generico. Corretta anche la fixture geometrica ETF10 per provare il limite reale.

### F03 — Alta priorità: storici incorporati nel worker

**Misura:** otto `*-history.json` totalizzano **117.663.718 byte**; `public/workers/project.worker.js` misura **93.405.653 byte** nella copia esaminata. Il worker importa `format.ts`, che raggiunge ricalcolo e cataloghi; questi importano staticamente gli archivi.

**Impatto:** inizializzazione e memoria pagate anche quando basta la revisione corrente. `services/import/project-file.ts` crea un worker nuovo con timeout di 20 secondi. Trasferimento, parsing e memoria a freddo possono consumare quel margine. Non è stato misurato il traffico HTTP compresso: dimensione su disco e byte di rete non sono equivalenti.

**Intervento minimo da progettare:** metafile esbuild, separazione parsing/migrazione da ricalcolo, oppure caricamento delle sole revisioni richieste. Conservare storici e compatibilità; cancellare gli archivi non è una correzione.

**Accettazione:** progetti correnti/storici equivalenti, worker ridotto, tempi e picco memoria misurati su PC/iPad. La suite finale misura 839,81 s reali, con 3.210,01 s cumulativi di import fra i worker e 56,51 s cumulativi nei test: il costo degli import è un indizio misurato, da attribuire con profiling prima di cambiare la pipeline. Il typecheck con heap 8 GB ha raggiunto diagnostiche reali invece dell’esaurimento a 4 GB osservato prima: più memoria è un rimedio operativo, non la soluzione strutturale.

### F04 — Media: anche GET riscrive tutto l’archivio condiviso

**Evidenza:** `app/api/projects/route.ts:48` usa `sharedTransaction` per GET. `server/project-sharing.ts:88` prende il lock, legge tutti i dati e scrive/rinomina l’intero archivio anche se non cambia nulla.

**Caso:** aggiornamento elenchi da più operatori durante un salvataggio; letture e scritture contendono il medesimo lock. Costo crescente con progetti e audit. Non è dimostrata perdita dati.

**Intervento:** distinguere lettura consistente e mutazione, preservando atomicità e recupero del lock. Misurare prima su due client; nessuna migrazione automatica a database.

### F05 — Media: errore archivio condiviso simile a elenco vuoto

**Evidenza:** `services/project/shared-repository.ts:132–142` intercetta qualsiasi errore di `sharedRequest` e restituisce i soli progetti locali non condivisi.

**Caso:** rete indisponibile/sessione scaduta; progetti condivisi apparentemente assenti, senza spiegazione. Il server non risulta averli cancellati.

**Intervento:** stato “Archivio condiviso non disponibile” con Riprova; eventuale cache dichiarata come tale e in sola lettura, con revisione. Test di indisponibilità separato da vero elenco vuoto.

### F06 — Media: limite di velocità del tubo mostrato, senza controllo dedicato

**Evidenza:** `maxAirVelocityMs` e `maxPressurePa` sono mostrati da `DuctPanel.tsx`; non emerge un controllo dedicato in `validation.ts`.

**Caso da coprire:** ramo unico Ø160 a 2.500 m³/h: velocità media circa 34,5 m/s. L’assenza di un punto di perdita tabellare non sostituisce l’avviso sul superamento della velocità.

**Intervento:** con portata di ramo univoca verificare `Q / (3600 × area)`. Più tubi non ricevono una divisione uniforme implicita. Il limite di pressione richiede bilancio di rete; non confrontarlo con la sola perdita lineare del tubo.

### F07 — Qualità: dato incompleto scambiabile per dato verificato

**Evidenza:** stati Ecoclima, segnalazioni prezzo, radiatori schematici, mesh in revisione, frontali accessori senza quota.

**Caso:** scelta manuale di un elemento riconoscibile in 3D interpretata come prodotto già dimensionato o preventivo completo.

**Intervento:** stati distinti per prestazioni, geometria e prezzo, visibili nella scelta e nel dossier. Prima riusare i contratti esistenti; aggiungere campi solo dove manca informazione rappresentabile.

### F08 — Corretto/parzialmente mitigato: gate statici e fixture superati

Il typecheck ha trovato: possibile catalogo precedente nullo nell’importatore Ecoclima; candidato ventilconvettore senza il nuovo campo `coverType`; accesso a `fanCoils` opzionale nel test browser. Correzioni minime, senza cambiare dati del catalogo o configurazioni salvate.

La suite generale ha isolato un test di posa a parete che usava EDLS, ora non compatibile con quel montaggio. La fixture usa EDLH: il controllo commerciale resta attivo. Il motore non viene indebolito per far passare un test.

### F09 — Documentazione discordante

Roadmap schema v2, checkpoint del 4 ottobre e vecchi conteggi non descrivevano più il progetto. Rimossi i due duplicati; storico delle prove mantenuto e distinto da questo report. Il codice corrente usa schema 11.

### Limiti dichiarati, non nuovi bug

- Muri curvi a corde, documentati da `shortcut:` in `geometry/curved-wall.ts`; archi analitici soltanto se servono output esecutivi.
- Geometrie schematiche utili per orientamento, insufficienti a certificare dettagli costruttivi.
- Stima termica volume × coefficiente, distinta da calcolo energetico normativo.
- Curve ventilatore, rumore, manutenzione e perdite locali assenti non ricavabili da foto o serie simili.
- Collisioni campionate da provare su percorsi lunghi e scene dense, senza dichiararle analiticamente complete.

## 6. Realismo 3D: criteri e lavoro residuo

Separare cinque livelli: riconoscibilità, ingombro metrico, connessioni, posa/manutenzione, fabbricazione. La UI deve dichiarare il livello raggiunto. Il render non sostituisce quote e connessioni.

| Famiglia | Conservare | Completare | Prova |
|---|---|---|---|
| Radiatori tubolari | Passo, elementi, testate, inviluppo tecnico | Origine differenza CAD/larghezza e dettagli quotati | Bounding box, interasse, elementi, stessa taglia |
| Fissi/decorativi | Sagoma/foto con fedeltà dichiarata | Geometria per famiglia realmente usata | Nessuno stretching arbitrario di prodotto fisso |
| Ventilconvettori incasso | Corpo/pannello distinti | Kit, cornici, griglie, cassaforma per posa | Mesh, collisioni e distinta della stessa configurazione |
| Canalizzati | Involucro diverso da attacco | Flange/collari e spazio raccordo | Tubo sul collare, non al centro del corpo |
| Split/PDC/VRV | Quota/orientamento e ingombro | Attacchi e servizio da fonte specifica | Quote della variante e volume manutenzione separati |
| Terminali | Fronti e plenum commercialmente coerenti | Quote risolte delle famiglie prioritarie | L/H/profondità, feritoie e attacchi |
| Architettura | Tetto, fasce, contropareti, aperture | Sezione vuoti e fori/accessi misurati | 2D/3D, volume utile e routing concordanti |
| Flessibili | Linea d’asse e tubo corrugato illustrativo | Sostegni/freccia con dati dichiarati | Lunghezza/raggio/collisioni sulla stessa curva |

**Mesh Cordivari:** tutte le 18 restano `review`. Per Ardesia 2 colonne, i sei STEP REV00 ufficiali 460/690/1150×1800/2000 misurano l’assemblaggio L+24,6 mm (catalogo: corpo L+24); il GLB OBJ 460×1800 misura 493,2 mm contro STEP 484,6 mm. Le fonti 3D dello stesso produttore non concordano; niente tagli o scale. Le misure STEP sono registrate in `.cache/report-fixes/ardesia-oem-460-1800/step-measurements.json`. [Pagina OEM Ardesia 2 colonne](https://www.cordivari.it/prodotto/radiatore-tubolare-ardesia-2-colonne/), [pagina OEM 3 colonne](https://www.cordivari.it/prodotto/radiatore-tubolare-ardesia-3-colonne/).

**Prestazioni:** le barre AirLeaf usano già `InstancedMesh`; l’export SketchUp espande le istanze mantenendo il gruppo. Riusare questo schema. Prima di aumentare poligoni misurare frame rate in drag/orbita, draw call, triangoli e texture su PC/iPad. Livello grafico ridotto solo dove serve, senza cambiare l’inviluppo tecnico.

## 7. Flessibili da ogni lato

### Già presente nella working tree

Sei facce dei plenum manuali, lato per ogni stacco, trasformazione con il corpo, tangenti esterne ai collari. Curve con archi tangenti, preferenza R=2D e minimo applicabile al tubo. Punti editabili 2D/3D e salvati; collisioni con corpi, pilastri e superfici; lunghezza sulla curva, cavità laterali usate nel routing; tracciato invalido mantenuto correggibile.

“Ogni lato” significa ogni faccia fisicamente ammessa. Un plenum su misura può avere sei facce; un accessorio OEM con stacco superiore non deve acquisire un collare laterale inventato.

| Aspetto | Regola | Fallimento recuperabile |
|---|---|---|
| Stacco | Faccia e diametro consentiti evidenti | Motivare incompatibilità |
| Endpoint | Sul collare, con tangente uscente | Conservare bozza, segnalare ostacolo |
| Cambio lato | Aggiornare proposta; manuale sostituito soltanto esplicitamente | Evidenziare conflitto, non cancellare punti |
| Raggio | Minimo coerente con prodotto e diametro | Punto critico e comando modifica |
| Collisione | Volume del tubo, non solo asse | Nessuna approvazione vicino a muro senza spazio |
| Portata | Unica o dichiarata ignota | Non dividere fra più tubi implicitamente |
| Perdite | Distribuite/locali/terminale separate | Totale incompleto esplicito, non zero |
| Diametro | Compatibilità tubo/collare | Riduttore esplicito o incompatibilità |
| Sostegni/freccia | Posizioni e requisiti da fonte o rilievo | Nessuna conformità inventata |

### Matrice di accettazione

1. Sei facce × tre rotazioni, almeno due quote: endpoint e tangenti verificati.
2. Più stacchi senza cambio indice o sovrapposizione dopo salvataggio.
3. Raggio sotto/al/sopra limite, duplicati, collinearità, inversione.
4. Percorso lungo, loop e auto-intersezione con diametri diversi e tolleranza misurata.
5. Ostacoli presso collare, angolo controparete, fascia, apertura e pilastro.
6. Movimento macchina: proposta aggiornata, punti manuali preservati, conflitto leggibile.
7. Cambio tubo/diametro: ricontrollo senza modificare collari e distinta silenziosamente.
8. Undo/redo, export/import, PDF e SKP sulla stessa curva e lunghezza.

Simulazione a molle rinviata: prima completare curva vincolata, dati di posa e feedback. Una freccia decorativa non deve alterare lunghezza/collisioni senza partecipare al modello.

## 8. Controsoffitti e cartongesso

`ceilings.ts` gestisce quota finita, fasce, falde, fronti e volume utile. `drywall.ts`/`drywall-sides.ts` gestiscono lato stanza, angoli e scostamento firmato. Schema 11 conserva due configurazioni sui due lati della parete condivisa.

Il vuoto tecnico è distinto dal volume climatizzato. Sezionare il render non autorizza ad attraversare lastre o struttura.

### Flusso operativo proposto

1. Verificare quota struttura, pavimento di riferimento e tetto della stanza.
2. Definire quota finita generale e fasce con lunghezza, profondità e quota.
3. Definire contropareti e lato; mostrare area/volume prima e dopo.
4. Evidenziare vuoti disponibili in sezione quotata.
5. Posare apparecchi con ingombro del kit completo.
6. Collegare plenum/tubi nel volume disponibile.
7. Definire aperture/ispezioni e accessibilità, quando i requisiti sono noti.
8. Ricalcolare controlli, dossier e computo.

**Scostamento firmato:** positivo costruisce verso la stanza; negativo dichiara cavità dietro un fronte già disegnato. Proposta UI: “Nuova controparete” / “Fronte già disegnato”, profondità positiva, anteprima lato. Conversione nel valore firmato attuale al salvataggio: nessuna migrazione solo per cambiare linguaggio.

| Estensione | Prima versione sufficiente | Prerequisito |
|---|---|---|
| Disegno fasce in pianta | Trascinamento e quote sugli oggetti attuali | Contenimento/sovrapposizione esistenti |
| Vista vuoto tecnico | Toggle sezione con quote | Riferimento grafico distinto dal volume verificato |
| Foro del terminale | Sagoma associata e fonte | Foro posa distinto da ingombro frontale |
| Botola | Rettangolo misurato e nota accesso | Requisito manutenzione specifico |
| Computo cartongesso | Superfici e aperture geometriche | Strati, profili e sfrido scelti separatamente |
| Coordinamento impianti | Interferenze fra oggetti presenti | Tolleranze condivise |

Non introdurre stratigrafie o certificazioni antincendio/acustiche implicite: richiedono sistemi costruttivi e fonti precisi.

## 9. UX: percorso più lineare

La direzione “Atlante tecnico” è appropriata: modello centrale, navigazione Staiano, misure tabulari e proprietà contestuali. Non serve cambiare identità visiva.

Valutazioni indipendenti A (percorso) e B (detector/browser), senza scambio dei risultati prima della sintesi. Detector: nessun rilievo su `Configurator.tsx`, `DrywallProperties.tsx`, `DuctPanel.tsx`, `CeilingDesign.tsx`. Non equivale a certificazione accessibile.

Due nuove schede su localhost:3015 sono finite su `/licenza?state=invalid`: “Licenza locale non valida per questa postazione”. Schede chiuse; nessuna modifica a licenza/credenziali. Configuratore, overflow, touch e tastiera completi non verificati live. Screenshot d’archivio soltanto storici. Nessun punteggio Nielsen numerico attribuito senza prova corrente.

### Cosa funziona già nel codice

Salvataggio esplicito con `role="status"`, conflitti con Salva copia/Carica versione archivio, wizard persistente e sospendibile, pagina Controlli con filtri e “Mostra nel progetto”, limiti OEM visibili nel pannello canale.

### Cinque interventi concreti

| Priorità | Caso | Intervento minimo | Evidenza |
|---|---|---|---|
| P2 | Errore del wizard senza collegamento all’oggetto | Riusare `showCheck`/`resolveCheckTarget`, conservando ritorno alla fase | `ConfigurationWizard.tsx:334–347`, `Configurator.tsx:761` |
| P2 | Fase Impianti nomina ventilconvettori ma offre macchina/radiatore | Un ingresso apparecchi sugli strumenti esistenti; qualificare macchina canalizzata | `InstallationWizard.tsx:31–59` |
| P2 | Vuoti tecnici scoperti dopo posa impianti | Quote struttura/finita/vuoto nel passo Stanze, apertura proprietà attuali | `ConfigurationWizard.tsx:266–297`, `CeilingDesign.tsx` |
| P2 | Segno del cartongesso nasconde due intenti | Scelta esplicita, profondità positiva, anteprima area | `DrywallProperties.tsx:58–81` |
| P2 | Coordinate testuali competono con editor visivo | Modifica 3D primaria; `X;Y;quota` in Coordinate avanzate | `DuctPanel.tsx:104–147`, `:235–318` |

“Conferma e continua” registra la revisione della fase, non rende valido il progetto. Mostrare errori/avvisi residui e distinguere Guida completata da Progetto verificato.

**Percorso finale:** pianta/scala → ambienti/quote finite → apparecchi → collegamenti/percorsi → controlli mirati → dossier. Ogni fase mostra oggetto corrente, prossimo passo e dati mancanti. Gli esperti conservano strumenti diretti e scorciatoie; niente secondo flusso duplicato di configurazione.

Questions skipped: la richiesta definisce già report e piano; nessun nuovo giro decisionale necessario per consegnarli.

## 10. Piano di attuazione dettagliato

Stime in giornate nette per una persona, orientative. Acquisizione OEM e disponibilità di licenza/strumenti possono allungare il calendario. Non sono promesse né autorizzazioni a pubblicare.

| Fase | Pacchetti | Uscita | Stima |
|---|---|---|---:|
| A — Baseline | P01–P03 | Gate riproducibili, inventario e costo bundle misurato | 3–6 giorni |
| B — Geometria/posa | P04–P08 | Attacchi, percorsi e vuoti coerenti | 7–13 giorni |
| C — Percorso utente | P09–P11 | Meno cambi di contesto, archiviazione chiara | 4–7 giorni |
| D — Famiglie prioritarie/consegna | P12–P14 | Dati e mesh verificati, build collaudata | 5–10 giorni più attese OEM |

Totale indicativo 19–36 giornate, escluso completamento manuale di ogni famiglia schematica. Le attività catalogo possono procedere durante B/C. Le stime di pacchetto si sovrappongono parzialmente e non vanno sommate di nuovo alle fasi.

### P01 — Baseline e regressioni

- **Priorità/dipendenze:** alta, primo ingresso.
- **File:** test esistenti, `validation.ts`, fixture dei flussi coinvolti.
- **Lavoro:** registrare Node/HEAD/modifiche; isolare ogni fallimento; distinguere fixture errata e regressione; conservare log. Nessun aggiornamento indiscriminato degli snapshot.
- **Accettazione:** prova che fallisce prima e passa dopo; typecheck/lint; stato della suite completa esplicito, senza farlo derivare dai soli test mirati.
- **Stima/rischio:** 1–2 giorni; working tree estesa e prove di build diverse.

### P02 — Riduzione worker e storici

- **Priorità/dipendenze:** alta, P01.
- **File:** `scripts/build-browser-workers.mjs`, `project.worker.ts`, `services/project/format.ts`, `catalog-history.ts`, moduli cataloghi.
- **Lavoro:** metafile esbuild e cold-start; separare parsing/migrazione da refresh; scegliere caricamento revisioni necessarie o riduzione import; misurare inferenza TypeScript dei JSON.
- **Accettazione:** round-trip storico invariato, revisione mancante segnalata, nessun fallback silenzioso alla nuova, riduzione bundle e picco memoria misurati.
- **Stima/rollback:** 2–4 giorni; ripristino moduli e rigenerazione worker, archivi immutati.

### P03 — Qualità cataloghi visibile

- **Priorità/dipendenze:** alta, P01; parzialmente parallela a P02.
- **File:** `systems/CatalogAdmin.tsx`, schemi, report/inventari, `scripts/catalog-sources.mjs`.
- **Lavoro:** vista per produttore/revisione con fonte, prestazioni, geometria risolta e prezzo; apertura documento/pagina.
- **Accettazione:** conteggi dai dati, denominatori espliciti, record `review` non promossi automaticamente, associazioni e hash preservati.
- **Stima:** 1–2 giorni. Riutilizzare report esistenti prima di introdurre nuovo formato.

### P04 — Facce e stacchi

- **Priorità/dipendenze:** alta, P01/P03.
- **File:** `attached-plenums.ts`, `placement.ts`, `routes.ts`, proprietà plenum.
- **Lavoro:** sei facce manuali, sole facce OEM ammesse, disponibilità e orientamento dello stacco, più attacchi per faccia.
- **Accettazione:** sei facce × tre rotazioni, endpoint sul collare, tangenti esterne, reload e altro impianto invariato.
- **Stima:** 1–2 giorni. Nessuno schema nuovo se i campi attuali bastano.

### P05 — Editor flessibili comprensibile

- **Priorità/dipendenze:** alta, P04.
- **File:** `flexible-curve.ts`, `routes.ts`, `FlexibleDuct.tsx`, `DuctPanel.tsx`, editor 2D/3D.
- **Lavoro:** riepilogo lunghezza/diametro/raggio, punto critico e correzione; azioni sposta/aggiungi/rimuovi; coordinate avanzate; sostituzione di percorso manuale esplicita.
- **Accettazione:** limite geometrico provato, collari non attraversati, curva invalida correggibile, undo/reload coerenti, stesso asse per misura e rendering.
- **Stima:** 2–3 giorni. Non introdurre un secondo interpolatore soltanto grafico.

### P06 — Velocità e bilancio progressivo

- **Priorità/dipendenze:** media-alta, P03 e portate di ramo note.
- **File:** catalogo flessibili, `validation.ts`, `DuctPanel.tsx`, calcoli dominio esistenti.
- **Lavoro:** prima velocità sui rami univoci, poi perdite distribuite/terminale/accessori separate; curve locali soltanto da fonte.
- **Accettazione:** sopra/sotto limite; più tubi senza ripartizione restano indeterminati; punto assente non vale zero; totale incompleto esplicito.
- **Stima:** 1–2 giorni per velocità/primo riepilogo. Rete completa da stimare dopo acquisizione curve.

### P07 — Quote e vuoti nel passo Stanze

- **Priorità/dipendenze:** alta, P01.
- **File:** `ceilings.ts`, `CeilingDesign.tsx`, `Properties.tsx`, wizard, layer 2D, `ArchitectureMeshes.tsx`.
- **Lavoro:** struttura/finito/vuoto nel riepilogo, apertura proprietà, anteprima fascia, controllo intero ingombro su falde/fasce.
- **Accettazione:** apparecchio troppo alto gestito coerentemente; tubo nel vuoto ma non nella lastra; volume/carico aggiornati dopo reload; fascia interna intercettata anche senza vertici dell’apparecchio al suo interno.
- **Stima:** 2–3 giorni. Conservare apparecchi salvati che diventano incompatibili e segnalarli.

### P08 — Contropareti per lato, leggibili

- **Priorità/dipendenze:** alta, P07 per la lettura complessiva.
- **File:** `drywall.ts`, `drywall-sides.ts`, `wall-cavity.ts`, `DrywallProperties.tsx`, `DrywallLayer.tsx`, mesh.
- **Lavoro:** intento esplicito, lato evidenziato, area prima/dopo, due rivestimenti diversi su parete condivisa, aperture e angoli.
- **Accettazione:** segni con effetto metrico atteso, un lato non altera l’altro, cavità giusta per il tubo, export schema 11 senza perdita.
- **Stima/rollback:** 1–3 giorni; UI reversibile senza migrazione.

### P09 — Dal controllo all’oggetto

- **Priorità/dipendenze:** alta UX, P01.
- **File:** `ConfigurationWizard.tsx`, `Configurator.tsx`, `resolveCheckTarget`.
- **Lavoro:** callback Mostra nel progetto, piano/selezione corretti, ritorno alla guida, conteggi errori/avvisi.
- **Accettazione:** errore tubo porta al tubo e proprietà corretti; ID obsoleto recuperabile; guida conclusa non cancella errori.
- **Stima:** 1 giorno; riuso navigazione Controlli.

### P10 — Ingresso apparecchi unico

- **Priorità/dipendenze:** media, P09.
- **File:** `InstallationWizard.tsx`, toolbar/popup attuali, `project-store.ts`.
- **Lavoro:** stesso comando/strumenti per famiglie; preservare bozze e indipendenza degli impianti.
- **Accettazione:** nessun impianto duplicato per aprire un pannello; più apparecchi indipendenti; Escape/undo/selezione preservano progetto.
- **Stima:** 1–2 giorni; niente secondo wizard commerciale.

### P11 — Fiducia nell’archivio condiviso

- **Priorità/dipendenze:** media, P01.
- **File:** `shared-repository.ts`, `server/project-sharing.ts`, route progetti e stato UI.
- **Lavoro:** errore elenco visibile, letture diverse da mutazioni, misura lock/audit, due client e rinnovo lease.
- **Accettazione:** errore rete distinto da cancellazione, lettura non perde revisioni, conflitto recuperabile, permessi invariati.
- **Stima:** 2–3 giorni. Preservare scrittura atomica, recupero lock e copia precedente.

### P12 — Realismo delle famiglie prioritarie

- **Priorità/dipendenze:** media-alta, P03/P04/P07.
- **File:** `viewer3d/*Meshes.tsx`, geometrie dominio, curation, manifest asset, test ingombri/export.
- **Lavoro:** iniziare da EDLS/EDFL/EDSC-C/EGA6, ventilconvettori incasso, canalizzati/plenum e radiatori usati. Per famiglia: scheda quote e confronto frontale/laterale/attacchi.
- **Accettazione:** variante riconoscibile e quotata, inviluppo/distinta della stessa configurazione, fonte intatta, rese inalterate per esigenze estetiche.
- **Stima:** 3–6 giorni primo gruppo; intero catalogo da stimare con tavole disponibili. 473 record schematici non richiedono necessariamente 473 mesh separate.

### P13 — Dossier e output coerenti

- **Priorità/dipendenze:** media, P05–P08/P12.
- **File:** `services/pdf/dossier.ts`, render, `sketchup-geometry.ts`, distinta.
- **Lavoro:** lacune tecniche riepilogate, sezione vuoto, lunghezze/quote uguali all’editor, configurazione incasso e accessori.
- **Accettazione:** PDF completo/sintetico leggibili, prezzi ignoti distinti, plenum non duplicati, istanze SKP e limite complessità gestiti.
- **Stima:** 1–2 giorni; non duplicare il motore controlli nel PDF.

### P14 — Collaudo e consegna installata

- **Priorità/dipendenze:** obbligatoria prima di distribuire; tutti i pacchetti inclusi.
- **File:** script build/deploy e test esistenti, verbale verifiche.
- **Lavoro:** typecheck/lint, suite finale, E2E toccati PC/iPad, build alternativa, collaudo pacchetto separato; installazione/riavvio e header per consegna reale.
- **Accettazione:** build ID pacchetto/server concordanti, accesso/licenza validi, progetti storici apribili, fonti presenti, rollback disponibile; solo GitLab.
- **Stima:** 1–2 giorni esclusa risoluzione problemi emersi. Compilazione da sola non dimostra rilascio.

## 11. Nuove funzionalità fattibili

| Proposta | Beneficio | Prima versione | Costo | Vincolo |
|---|---|---|---|---|
| Vai al problema dalla guida | Meno ricerca/cambi contesto | Navigazione Controlli riusata | Basso | P09 |
| Anteprima vuoto disponibile | Evita pose impossibili | Sezione e quote struttura/finito | Medio | P07/P08 |
| Stato tecnico prodotto | Riduce fiducia eccessiva in render/prezzo | Prestazioni/geometria/prezzo distinti | Basso-medio | Report esistenti |
| Confronto due alternative | Scelta senza perdere configurazione | Schede affiancate, applicazione esplicita | Medio | Stesse condizioni di prova |
| Computo cartongesso | Supporto al preventivo | Superfici e aperture geometriche | Medio | Strati/sfridi dichiarati |
| Botole/accessi | Coordinamento installatore/cartongessista | Ingombro misurato collegato all’apparecchio | Medio | Requisiti OEM |
| Differenze fra revisioni | Mostra modifiche prima del dossier | Riuso audit condiviso | Basso-medio | Permessi invariati |
| Fonti da aggiornare | Manutenzione cataloghi più rapida | URL/hash/revisione/ultima verifica | Medio | Documenti mutati accettati esplicitamente |
| Vista cliente con note selettive | Render comprensibile | Riuso vista cliente e riepilogo lacune | Basso | Nessuna nuova promessa di conformità |

Rinviati: simulazione termo-fluidodinamica completa, fisica del tubo in tempo reale, BIM dell’intero edificio, scraping illimitato, cloud obbligatorio e cambio stack. Non servono per completare il flusso e richiedono ulteriori dati/validazioni.

## 12. Pulizia Markdown

### Eliminati

| File | Motivo | Informazioni mantenute |
|---|---|---|
| `STAIANO-3D/ROADMAP.md` | Stato dichiarato completo, schema v2 e vecchi conteggi; duplicava prove e orientamento | Piano qui, verifiche datate, README/architettura |
| `STAIANO-3D/CONTINUATION.md` | Checkpoint 4 ottobre con vecchio build ID e suite; duplicava procedure/rimandi | AGENTS, README, verbali e guide |

Nessun riferimento a questi due nomi trovato nel repository prima della rimozione. Eliminazioni puntuali, nessuna cancellazione ricorsiva. Git conserva le versioni tracciate.

### Mantenuti intenzionalmente

- `AGENTS.md` e `CLAUDE.md`: istruzioni operative; il rimando di CLAUDE non è un doppione di prodotto da cancellare alla cieca.
- README workspace/app: responsabilità diverse, orientamento e uso.
- `PRODUCT.md`, `DESIGN.md`, brief `.impeccable`: contratti usati dal workflow.
- `ARCHITECTURE.md`: decisioni e vincoli, anche storici.
- `VERIFICATION.md`, audit e requisiti datati: prove e accettazione, con rimando al riferimento corrente.
- Guide importazione/DWG/riconoscimento/accesso/PDF/plenum: procedure specifiche.
- README runtime nativi/deploy/licenza/modelli/cataloghi: compilazione, fonti, hash e diritti.
- Licenze e provenienza sotto `public/materials3d` e `catalog-data/sources`: prove da conservare.

Pulizia significa ridurre contraddizioni, non eliminare licenze o prove perché non importate dal codice.

## 13. Verifiche e limiti

### Evidenze concluse durante la lavorazione

- Manifest fonti allineato a **547 documenti**, tutti archiviati per hash; l’allineamento non equivale al confronto manuale di tutte le pagine.
- Due regressioni riprodotte prima della correzione: **2 fallimenti, 43 successi** nei due file mirati.
- Regressioni finali: **53 test passati in 3 file**, `routes.test.ts`, `flexible-curve.test.ts`, `validation.test.ts`.
- TypeScript completo passato con heap 8 GB dopo la correzione dei tre problemi statici descritti.
- ESLint sui sette file modificati in questo passaggio: passato. Prettier applicato agli stessi file.
- Due valutazioni UX isolate; detector senza rilievi sui quattro componenti. Configuratore live non raggiunto per licenza non valida.
- Censimento JSON, ID, stati e dimensioni degli archivi completato; distinzione fra cataloghi correnti e storici.

Log locali: `STAIANO-3D/.cache/audit-2026-10-25/`. Non richiedono commit. Gli esiti conclusivi sono registrati nella sezione 15.

### Prove precedenti conservate

Il precedente report registrava 17 test ventilconvettori, 15 dossier, 19 progetto/termico, 12 spessori muri; i documenti datati registrano ulteriori unit/E2E. Restano evidenze dei passaggi di origine, non vengono sommate a questo run o trasformate in collaudo della build installata.

### Fuori dalla verifica attuale

- Confronto manuale di ogni riga contro tutte le 541 fonti.
- Certificazione CAD di fabbricazione o dimensionamento normativo.
- Benchmark reale di rete a freddo, GPU/iPad e memoria browser.
- Risoluzione licenza/credenziali; pubblicazione GitLab e installazione EXE come parte dell’audit documentale.
- Audit di sicurezza esaustivo, penetration test e aggiornamento automatico delle dipendenze.

## 14. Traguardo operativo

Primo progetto di accettazione: due impianti indipendenti, controsoffitto a fasce, parete condivisa con due contropareti, più flessibili con attacchi su facce diverse. Deve essere configurabile, salvabile, riapribile e documentabile senza passaggi ambigui.

Un pacchetto si chiude quando comportamento, dati, prove ed eventuale distribuzione richiesta concordano. Le lacune OEM restano visibili fino all’acquisizione della fonte; una forma plausibile non le risolve.

## 15. Verbale conclusivo del 25 ottobre 2026

| Verifica | Esito / evidenza |
|---|---|
| Regressioni geometria/controlli | 53/53 in 3 file; `regression-final.log` |
| Posa parete/ventilconvettori | 41/41 in 2 file; `graphic-final.log` |
| Python ETF10 | 2/2; parser e punti tabellari |
| Python prezzi workbook | 7/7; identità delle varianti commerciali |
| TypeScript completo | Passato con heap 8 GB; `typecheck-final.log` |
| ESLint sui sette file toccati | Passato |
| Prettier sugli stessi file | Applicato; nessuna modifica estetica intenzionale |
| `git diff --check` | Passato |
| Manifest fonti | Allineato a 547 documenti; 547/547 archiviati |
| Coerenza radiatori | 939 record: nessuna Q30≥Qref e nessuna quota base non positiva |
| Involucri macchine | 21 HVAC, 123 fan-coil, 61 PDC senza quote corpo mancanti nei tre campi dimensionali |
| ETF10 strutturale | 154 punti: nessun duplicato diametro/portata e nessun valore non positivo |
| Build produzione | Passata in `.next-update`; ID `xa7Fk1a1IYRLIcTzlMhnS` |
| Worker progetto corrente | 482.480 byte; il metafile non include cataloghi o archivi storici; profiling locale registrato in `docs/REPORT-FIXES-2026-10-25.md` |
| Avvio HTTP di collaudo | Fallito: `listen EACCES: permission denied 127.0.0.1:3016`; nessun server di collaudo rimasto attivo |
| Browser sul server esistente | Pagina licenza non valida; configuratore non raggiunto |
| Suite finale precedente | **872/872 test, 133/133 file passati**; `unit-final.log`; 839,81 s |
| Suite corrente dopo catalogo LG | **895/895 test, 138/138 file passati**; include split, outdoor e presentazioni LG |
| E2E finale dopo LG, immagini e timeout OCR | **245 passati, 8 saltati, 0 falliti**; 13,2 min con 2 worker, Next dev isolato (`127.0.0.1:4027`) |
| EXE attivo installato | `APOSavOxDSuJVV4dYCcXB`, SHA-256 `eeae7f60…ee32ddbe`; task `Running`, `/accedi` e `/licenza` HTTP 200, header build concorde, rollback precedente presente |
| EXE locale finale | `nn1FeG7j0I0kV2wtGxEDW`, 275.890.176 B, SHA-256 `db8d27c8…dad23a3c`; `--version`, hash e manifest concordi; include fix hash/cached catalog docs, non installato dopo annullamento UAC |
| Installazione/pubblicazione | Installazione locale eseguita; aggiornamento finale in attesa di elevazione Windows. Nessuna pubblicazione GitLab |

Il primo run generale, sequenziale, è stato interrotto: era partito prima delle correzioni e conteneva i fallimento geometrico della fixture ETF10 e quello della posa a parete successivamente risolti. Non viene presentato come gate finale. La suite conclusiva ha usato quattro worker sul codice stabilizzato ed è terminata con tutti i test superati. Il reporter agent di Vitest riporta il riepilogo alla fine, per questo durante il run non erano visibili righe di avanzamento.

Comandi di riproduzione, dalla sottocartella `STAIANO-3D/`:

```powershell
node --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit
node --max-old-space-size=8192 node_modules/vitest/vitest.mjs run --maxWorkers=4
python -m unittest discover -s scripts/catalog-import -p test_ecoclima_flexible_ducts.py
python -m unittest discover -s scripts/catalog-import -p test_ecoclima_price_workbooks.py
npm run catalog:sources:check
```

La sessione ha usato cartelle TEMP/TMP dedicate sotto `.cache/audit-2026-10-25/`. In sandbox i processi figli possono richiedere esecuzione autorizzata fuori dal contenitore. La build usa `STAIANO_BUILD_DIR=.next-update` e `NODE_OPTIONS=--max-old-space-size=8192`, limitati al comando.

**Stato della consegna:** correzioni sorgente e installazione locale verificate; resta da attivare il pacchetto finale `nn1FeG7j0I0kV2wtGxEDW`, che corregge la cache documenti LG. La build installata risponde regolarmente, ma finché non si aggiorna conserva un avviso documenti obsoleto nonostante i 547 hash presenti. Nessuna pubblicazione GitLab.
