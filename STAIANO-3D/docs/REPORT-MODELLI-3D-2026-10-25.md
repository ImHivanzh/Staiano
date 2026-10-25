# Report dei modelli 3D generici o scorretti

Data: 25 ottobre 2026. Cordivari escluso dall'audit delle geometrie, come richiesto.

Questo report fotografa lo stato precedente alle ricostruzioni richieste in seguito.
Per lo stato corrente e la correzione della lettura degli attacchi Garda vedere
[Modelli 3D: ricerca e ricostruzione](MODELLI-3D-RICOSTRUZIONE.md).

## Esito

Il visualizzatore usa prevalentemente ricostruzioni procedurali. Le dimensioni di
catalogo non dimostrano la fedeltà della forma. Foto e loghi ufficiali non sono mesh
del prodotto. Le anomalie confermate più rilevanti sono:

1. **Zehnder Nova Easy, 32 varianti:** numero di profili diverso dal catalogo.
2. **LG 4 Way Cassette, 2 modelli:** sagoma e dettagli di uno split a parete.
3. **Lazzarini Garda, 8 varianti:** valvola e detentore disegnati ai lati, anziché
   all'interasse centrale di 50 mm documentato nel catalogo.

Gli altri casi sotto sono classificati come **generici**, oppure **ricostruzioni
parziali**. Non vengono dichiarati scorretti solo perché mancano mesh originali.
Il report documenta gli interventi necessari; questa modifica corregge il colore
degli accessori, non ricostruisce le geometrie elencate.

## Copertura

Cataloghi correnti effettivamente importati dai moduli applicativi in
`src/domain/catalogs/`; esclusi snapshot `.previous`, staging e cataloghi storici.
Le quantità contano record di catalogo, non apparecchi installati né tutte le
possibili batterie di elementi o combinazioni multisplit.

| Categoria            |      Record esaminati | Stato della forma                                                          |
| -------------------- | --------------------: | -------------------------------------------------------------------------- |
| Radiatori Global     |                    19 | Generica                                                                   |
| Radiatori Zehnder    |                   188 | 156 generici; 32 con errore confermato                                     |
| Radiatori Lazzarini  |                    63 | 49 Sanremo generici; 8 Garda con errore negli accessori; 6 Empoli parziali |
| Unità interne split  |                   110 | 2 cassette errate; altre generiche o parziali                              |
| Unità interne VRV    |                     7 | Generiche                                                                  |
| Unità esterne split  |                    91 | Mobile e ventilatore condivisi                                             |
| Unità esterne VRV    |                    18 | Mobile e ventilatore condivisi                                             |
| Ventilconvettori     |                   123 | Corpi e griglie schematici                                                 |
| Pompe di calore      |                    61 | Mobile condiviso, colore e identificazione dedicati                        |
| Macchine canalizzate |                    21 | Parallelepipedo con faccia illustrativa                                    |
| Terminali Ecoclima   | 1.778 in 127 famiglie | Cinque schemi grafici condivisi                                            |

Le famiglie e i relativi conteggi sono riportati nell'inventario in fondo.
L'inventario comprende anche varianti dimensionali non ammesse alla selezione
automatica: la presenza nel catalogo non implica che siano tutte inseribili.

## Anomalie confermate e priorità

### P1 — Zehnder Nova Easy ZNV, ZNVL, ZNVV, ZNVLV

Tutte le quattro famiglie hanno 8 varianti: altezze 1.800/2.000 mm e quattro
larghezze. Il catalogo registra esplicitamente il numero di tubi in `widthNote`.
Il ramo per prodotti fissi di `radiatorDetail` usa invece
`Math.round(larghezzaMm / 55)` e sezioni piene con profondità pari al corpo.

| Larghezza | Tubi da catalogo | Profili disegnati |
| --------: | ---------------: | ----------------: |
|    361 mm |                5 |                 7 |
|    432 mm |                6 |                 8 |
|    504 mm |                7 |                 9 |
|    575 mm |                8 |                10 |

Esempio riproducibile: `zehnder-nova-znv-180-005-3570-9016` dichiara 5 tubi;
il renderer ne genera 7. Le varianti doppie e gli allacciamenti non hanno una
costruzione dedicata. Occorre usare numero e sezione dei tubi, disposizione delle
file e collettori delle rispettive tavole.

Fonti: [renderer radiatori](../src/configurator/viewer3d/device-detail.ts),
funzione `radiatorDetail`, ramo `construction === "fixed"`;
[catalogo Zehnder](../catalog-data/generated/zehnder.json), `widthNote` e
`sourceMetadata` delle quattro famiglie, listino 06/2026, pagina 4.

### P1 — LG 4 Way Cassette

Modelli: `lg-cassette-4way-mt06r-nr0` (MT06R.NR0) e
`lg-cassette-4way-ct09f-nr0` (CT09F.NR0).

Il catalogo li identifica come cassette rettangolari. `SplitMesh` distingue
soltanto la cassetta tonda (`shape === "round"`); gli altri modelli ricevono
carrozzeria arrotondata, feritoia frontale, aletta e griglia superiore da split
murale. Mancano pannello inferiore a quattro vie e ripresa centrale.
Serve un ramo dedicato alle cassette rettangolari con gli ingombri del pannello.

Fonti: [DeviceMeshes](../src/configurator/viewer3d/DeviceMeshes.tsx), `SplitMesh`;
[catalogo split](../catalog-data/generated/splits.json), famiglia `4 Way Cassette`,
documento LG Multi Split 2021, pagina 14.

### P1 — Lazzarini Garda: posizione degli accessori

Le 6 varianti bianche e 2 nere riportano interasse 50 mm e quattro connessioni
da 1/2 pollice. `RadiatorHardware` posiziona i due accessori a
`±(larghezza/2 − 25 mm)`: interasse grafico 450 mm per corpo largo 500 mm,
550 mm per corpo largo 600 mm. Non legge `interaxisMm` né `connections`.

La posizione è quindi incompatibile con l'allaccio centrale documentato.
Anche la scala uniforme delle barre del corpo è illustrativa. Occorre una posa
degli accessori legata alla geometria delle connessioni; l'abbinamento colore
aggiunto in questa modifica non corregge la posizione.

Fonti: [RadiatorHardware](../src/configurator/viewer3d/RadiatorHardware.tsx);
[catalogo Lazzarini](../catalog-data/generated/lazzarini.json), famiglie Garda,
`interaxisMm`, `connections`, documento Rev. 6 del 22/11/2023, pagine 2–3.

## Geometrie generiche e ricostruzioni parziali

| Gruppo                                                | Evidenza nel renderer                                                                                        | Intervento necessario                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Global VIP, OSCAR, OSCAR TONDO                        | Sezioni arrotondate e tre alette posteriori per elemento; nessun profilo dedicato per famiglia               | Sezione reale, testa e piede distinti; conservare passo e quote                                 |
| Zehnder Charleston 2–6 colonne                        | Colonne da catalogo, ma raggio derivato dal passo, teste sferiche e collettori comuni                        | Profilo e raccordi specifici Charleston                                                         |
| Lazzarini Sanremo bianco/cromato/antracite dritto     | Scala con barre equidistanti; quantità calcolata come `round(altezza/55)`                                    | Numero e raggruppamenti reali delle barre per taglia                                            |
| Lazzarini Empoli bianco/antracite/cromato             | Ricostruzione dedicata con 4/6 profili 70×11 mm, collettori Ø35 e specchio; spazi dichiarati illustrativi    | Completare allacci, supporti e dettagli dalla tavola; non assimilare alla scala generica        |
| Split Emura                                           | Frontale curvo dedicato ma costruito matematicamente                                                         | Sagoma e dettagli OEM per serie/taglia                                                          |
| Split Stylish e MSZ-EF                                | Arrotondamento ridotto, restante geometria comune                                                            | Frontali, alette e griglie specifici                                                            |
| Altri split a parete                                  | Stesso corpo, 18 lamelle frontali e 25 superiori; variazione di quote e marchio                              | Forme specifiche di famiglia, incluse finiture Mirror e serie con pannelli distintivi           |
| LG Round Cassette UT36F.NY0                           | Cilindro e disco inferiore scuro; riconosce la forma tonda                                                   | Completare ripresa, uscita anulare e pannello; classificazione parziale                         |
| Daikin VRV FXAA-A                                     | Passa a `SplitMesh`, che cerca solo nel catalogo split: nessuna famiglia VRV riconosciuta                    | Risoluzione famiglia dal catalogo VRV e dettagli dedicati                                       |
| Esterne split/VRV e pompe di calore                   | `OutdoorCabinet` comune: scatola e un solo ventilatore frontale; nessuna lettura della topologia del modello | Numero, posizione e diametro dei ventilatori; carter e griglie specifici                        |
| Pompe di calore Gree/Chaffoteaux/Daikin               | Colore Gree e loghi/targhe identificano il modello, ma il corpo resta condiviso                              | Modelli distinti per famiglia; loghi non equivalgono a geometria fedele                         |
| Ventilconvettori Innova/Olimpia Splendid/Aermec       | Corpi arrotondati e griglie schematici, pannelli dimensionati quando documentati                             | Forma e griglie reali; mantenere le quote già disponibili dei pannelli                          |
| Canalizzati Mitsubishi/Daikin/Gree e macchine manuali | Scatola con faccia scura e marcatore di orientamento                                                         | Carrozzeria e bocche reali; per macchine manuali resta corretto mostrare un ingombro dichiarato |
| Accessori radiatore                                   | Due raccordi cilindrici di misura costante; nessun modello commerciale di valvola/testa termostatica         | Modello di accessorio e posa dalle connessioni effettive                                        |

Fonti applicative:
[radiatorDetail](../src/configurator/viewer3d/device-detail.ts),
[DeviceMeshes](../src/configurator/viewer3d/DeviceMeshes.tsx),
[OutdoorCabinet](../src/configurator/viewer3d/OutdoorCabinet.tsx),
[AirOutdoorMeshes](../src/configurator/viewer3d/AirOutdoorMeshes.tsx),
[HydronicMeshes](../src/configurator/viewer3d/HydronicMeshes.tsx),
[FanCoilMeshes](../src/configurator/viewer3d/FanCoilMeshes.tsx),
[SystemMeshes](../src/configurator/viewer3d/SystemMeshes.tsx).

### Terminali Ecoclima

`TerminalMesh` usa cinque costruzioni: fessure da `slotCount`, cornici concentriche
EADD, reticolo EGQ, disco/anello per facce circolari, lamelle orizzontali per gli
altri rettangolari. Cornici, spessori e quantità delle lamelle sono in parte
proporzioni grafiche. Non esistono geometrie dedicate per ogni famiglia.

Sono quindi da completare, ad esempio, dettagli dei diffusori elicoidali,
ugelli, valvole, serrande e terminali di ventilazione meccanica. Per le fessure
il numero può essere documentato senza che l'intera sezione sia fedele.
Le profondità assenti non vengono inventate: il renderer può mostrare solo la
faccia. Questo è un limite esplicito, non prova di un ingombro errato.

Fonti: `TerminalMesh` e `linearTerminalSlots` nei renderer sopra;
[catalogo Ecoclima](../catalog-data/generated/ecoclima.json).

### Elementi che non richiedono una mesh di marca

Plenum personalizzati, condotte, collari e strutture edilizie sono geometrie di
progetto: la costruzione parametrica non è di per sé un difetto. I plenum salvati
usano quote e attacchi del progetto; non vanno classificati come falsi modelli OEM.
Gli oggetti arancioni «Da configurare» sono bozze dichiarate. Le stufe sono un
catalogo informativo e non hanno una mesh installata in `DeviceMeshes`.

### Viste ed esportazioni interessate

Vista 3D, render panoramici e modello per SketchUp usano lo stesso `DeviceMeshes`.
Le approssimazioni si propagano quindi a questi percorsi. Un catalogo storico
non risolto può inoltre portare ai rami generici: l'inventario seguente riguarda
i cataloghi correnti, non certifica ogni vecchio progetto.

Fonti: [render panoramico](../src/services/render3d/export.tsx),
[esportazione SketchUp](../src/services/render3d/sketchup.tsx).

## Modifica consegnata: accessori in tinta

- Valvola e detentore senza scelta esplicita seguono automaticamente il colore
  del corpo verniciato o minerale, compresi i colori di fabbrica senza `finishes`.
- Cambiare il corpo aggiorna gli accessori automatici; una scelta esplicita
  dell'accessorio prevale. Scegliere nuovamente «In tinta radiatore» ripristina
  l'abbinamento automatico.
- Valvola e detentore consentono anche le scelte esplicite **Bianco (generico)**
  e **Cromo (generico)** per qualsiasi produttore, comprese famiglie senza palette
  ufficiale. Le scelte si salvano nel progetto e restano distinte dalle finiture
  di marca in proprietà e distinta PDF.
- I corpi metallici mantengono il default accessorio documentato. Copritubi e
  tappi non vengono ricolorati dall'abbinamento.
- Se disponibile viene usata una finitura accessorio ufficiale con stesso colore
  e tipo; altrimenti la tinta è una previsione di progetto, segnalata in proprietà
  e distinta come disponibilità da verificare. Nessuna palette ufficiale ampliata.
- Nessuna modifica a potenza, dimensionamento o schema dei progetti. La regola è
  condivisa fra vista 3D, proprietà e distinta PDF. L'esclusione Cordivari riguarda
  il report delle geometrie; l'abbinamento colore si applica a tutti i radiatori.

## Verifiche e limiti

Analisi statica dei renderer e confronto con i dati dei cataloghi correnti.
Gli errori Nova, cassette LG e interasse Garda sono riproducibili dalle formule
e dai campi citati. Non è stato eseguito un confronto visivo con il prodotto reale
per ogni SKU; nessuna certificazione di fedeltà OEM viene implicata.

Test mirati: palette per tutte le famiglie e colori non metallici, rispetto delle
scelte esplicite, corpi metallici e famiglie sconosciute; distinta accessori e
geometrie del corpo. Prova browser dedicata in `tests/radiator-valves.spec.ts`.

Esiti verificati:

- Suite unitaria: **138 file, 899 test passati**.
- Aggiornamento bianco/cromo generici: **27 test mirati passati**, inclusi
  risoluzione per produttori sconosciuti e distinta; ricontrollati i due casi
  generici dopo l'aggiornamento della fixture PDF.
- Browser Edge: **1 prova passata**, comprendente tinta automatica, override,
  bianco/cromo generici, campioni colore, persistenza dopo ricaricamento e default
  del corpo cromato; nessun errore runtime o console.
- Screenshot del radiatore nero ispezionato: accessori neri visibili sotto il corpo.
- TypeScript, ESLint sui file modificati e build Next standalone riusciti.
- Assert sui cataloghi e sul renderer: tutti i 32 Nova hanno due profili in eccesso;
  tutti gli 8 Garda hanno interasse grafico diverso dai 50 mm documentati.
- EXE locale creato: build `D8irsFLj645J3k7U5BA8t`, SHA-256
  `d11fb2339babce564c4e4108c32aa554fa9fba86ec7b8b766d876bd1e24984e8`.
- Build verificata nel browser sulla porta 3456. La richiesta UAC dell'installer
  locale è stata annullata: nessun aggiornamento dell'attività Windows applicato.
  Verifica HTTP finale sulla porta 3015: risposta 200, build precedente
  `6JpHgTFcRmMtDX1dUiAG3`, coerente con il record dell'app installata.
  La richiesta UAC annullata non è stata riaperta per l'aggiornamento delle scelte
  generiche. Il pacchetto EXE corrente non è stato avviato né installato; restano
  da completare installazione e verifica del record e dell'header sulla porta 3015.
  Il suo SHA-256 è stato confrontato con `dist-exe/release.json`.

La suite browser completa non è stata eseguita; è stato verificato il flusso
interessato dalla modifica. Nessuna pubblicazione GitLab effettuata.

## Inventario dei cataloghi correnti

Le righe seguenti sono conteggiate direttamente dai JSON importati dall'app.

### Radiatori (270)

| Marca     | Famiglia                  | Record |
| --------- | ------------------------- | -----: |
| Global    | VIP                       |      5 |
| Global    | OSCAR                     |      7 |
| Global    | OSCAR TONDO               |      7 |
| Zehnder   | Charleston 2 colonne      |     34 |
| Zehnder   | Charleston 3 colonne      |     34 |
| Zehnder   | Charleston 4 colonne      |     34 |
| Zehnder   | Charleston 5 colonne      |     27 |
| Zehnder   | Charleston 6 colonne      |     27 |
| Zehnder   | Nova Easy verticale ZNV   |      8 |
| Zehnder   | Nova Easy verticale ZNVL  |      8 |
| Zehnder   | Nova Easy verticale ZNVV  |      8 |
| Zehnder   | Nova Easy verticale ZNVLV |      8 |
| Lazzarini | Sanremo bianco dritto     |     21 |
| Lazzarini | Sanremo cromato dritto    |     20 |
| Lazzarini | Sanremo antracite dritto  |      8 |
| Lazzarini | Garda bianco              |      6 |
| Lazzarini | Garda nero                |      2 |
| Lazzarini | Empoli bianco             |      2 |
| Lazzarini | Empoli antracite          |      2 |
| Lazzarini | Empoli cromato            |      2 |

### Unità interne split (110)

| Marca               | Famiglia            | Record |
| ------------------- | ------------------- | -----: |
| Daikin              | Perfera All Seasons |      8 |
| Mitsubishi Electric | MSZ-AY              |     12 |
| Gree                | Pular New           |      2 |
| Gree                | Pular               |      2 |
| LG                  | Round Cassette      |      1 |
| LG                  | Standard Plus       |     14 |
| LG                  | 4 Way Cassette      |      2 |
| LG                  | Mirror              |      5 |
| LG                  | Air Purification    |      2 |
| LG                  | Deluxe              |      5 |
| LG                  | Standard 2          |      5 |
| LG                  | DUALCOOL AI Deluxe  |      4 |
| LG                  | DUALCOOL AI Premium |      2 |
| Daikin              | Stylish             |      5 |
| Daikin              | Emura               |      5 |
| Daikin              | Comfora             |      6 |
| Daikin              | Sensira             |      7 |
| Gree                | Clivia              |      4 |
| Gree                | Airy                |      4 |
| Mitsubishi Electric | MSZ-HR              |      5 |
| Mitsubishi Electric | MSZ-EF              |      5 |
| Mitsubishi Electric | MSZ-LN              |      5 |

### Unità interne VRV (7)

| Marca  | Famiglia     | Record |
| ------ | ------------ | -----: |
| Daikin | VRV 5 FXAA-A |      7 |

### Unità esterne split (91)

| Marca               | Famiglia                            | Record |
| ------------------- | ----------------------------------- | -----: |
| Daikin              | Tutte le famiglie: carter condiviso |     39 |
| Mitsubishi Electric | Tutte le famiglie: carter condiviso |     25 |
| Gree                | Tutte le famiglie: carter condiviso |     19 |
| LG                  | Tutte le famiglie: carter condiviso |      8 |

### Unità esterne VRV (18)

| Marca  | Famiglia         | Record |
| ------ | ---------------- | -----: |
| Daikin | VRV IV S Compact |      3 |
| Daikin | VRV IV S         |      9 |
| Daikin | VRV 5 S          |      6 |

### Ventilconvettori (123)

| Marca            | Famiglia       | Record |
| ---------------- | -------------- | -----: |
| Innova           | AirLeaf SL     |     10 |
| Innova           | AirLeaf SLS    |      5 |
| Innova           | AirLeaf SLI    |     10 |
| Innova           | AirLeaf RSI    |      5 |
| Innova           | AirLeaf SLSI   |      5 |
| Olimpia Splendid | Bi2 Air        |      4 |
| Olimpia Splendid | Bi2 Smart S1   |      4 |
| Olimpia Splendid | Bi2 Naked SLI  |      7 |
| Olimpia Splendid | Bi2 Naked SLIR |      7 |
| Aermec           | FCZ            |     19 |
| Aermec           | FCZ P          |     26 |
| Aermec           | FCZ PO         |     21 |

### Pompe di calore (61)

| Marca       | Famiglia                 | Record |
| ----------- | ------------------------ | -----: |
| Chaffoteaux | ARIANEXT PLUS M LINK R32 |      3 |
| Chaffoteaux | ARIANEXT LITE M LINK R32 |      8 |
| Daikin      | Altherma 3 M             |     11 |
| Daikin      | Altherma 3 R             |      9 |
| Daikin      | Altherma 3 R MT          |      6 |
| Daikin      | Altherma 3 H HT          |      6 |
| Gree        | VERSATI V                |     10 |
| Gree        | VERSATI III Split        |      4 |
| Gree        | VERSATI III All In One   |      4 |

### Canalizzati (21)

| Marca               | Famiglia                    | Record |
| ------------------- | --------------------------- | -----: |
| Mitsubishi Electric | PEAD-M JA2 / Power Inverter |      7 |
| Daikin              | FBA-A9 / RXM                |      3 |
| Daikin              | FBA-A(9) / Sky Air Advance  |      4 |
| Gree                | U-Match VI / R32            |      7 |

### Terminali Ecoclima (127 famiglie, 1.778 varianti)

La costruzione indicata segue i rami attuali di `TerminalMesh`, compresa la priorità della faccia circolare. Se una famiglia ha varianti diverse sono elencati tutti gli schemi usati.

| Famiglia        | Varianti | Costruzione grafica  |
| --------------- | -------: | -------------------- |
| EDLS            |        6 | Fessure parametriche |
| EBLF            |       42 | Lamelle orizzontali  |
| ETA             |       18 | Lamelle orizzontali  |
| EGQ             |       72 | Reticolo             |
| EVVMC           |        6 | Disco/anello         |
| EGS             |       11 | Lamelle orizzontali  |
| EADD            |        5 | Cornici concentriche |
| EBA             |       33 | Lamelle orizzontali  |
| EBCV            |       12 | Lamelle orizzontali  |
| EBV             |       22 | Lamelle orizzontali  |
| EBIA            |       29 | Lamelle orizzontali  |
| EBL             |       31 | Lamelle orizzontali  |
| EBLR            |       15 | Lamelle orizzontali  |
| EBLS            |       25 | Lamelle orizzontali  |
| EGA             |       81 | Lamelle orizzontali  |
| EGA1-4          |       42 | Lamelle orizzontali  |
| EGA6            |       49 | Lamelle orizzontali  |
| EBL3            |       15 | Lamelle orizzontali  |
| EGA50           |       56 | Lamelle orizzontali  |
| EGA50-3F        |       56 | Lamelle orizzontali  |
| EGA50-3S        |       56 | Lamelle orizzontali  |
| EGZ50           |       56 | Lamelle orizzontali  |
| EGZ100          |       56 | Lamelle orizzontali  |
| EGQR            |       36 | Lamelle orizzontali  |
| EGQIF           |       42 | Lamelle orizzontali  |
| EGQ1-4          |       49 | Lamelle orizzontali  |
| EGQ-PUSH        |       36 | Lamelle orizzontali  |
| EGQR-PUSH       |        1 | Lamelle orizzontali  |
| EGF             |       30 | Lamelle orizzontali  |
| EGFR            |       16 | Lamelle orizzontali  |
| EGFF            |       42 | Lamelle orizzontali  |
| EGF-PUSH        |       59 | Lamelle orizzontali  |
| EGFR-PUSH       |        1 | Lamelle orizzontali  |
| EBP             |       24 | Lamelle orizzontali  |
| EBP-T           |       42 | Lamelle orizzontali  |
| EDE1            |        9 | Lamelle orizzontali  |
| EDE1R           |        6 | Disco/anello         |
| EDE2            |        9 | Lamelle orizzontali  |
| EDE2R           |        6 | Disco/anello         |
| EDE2S           |        1 | Lamelle orizzontali  |
| EDE5            |        4 | Lamelle orizzontali  |
| EDLH            |        6 | Fessure parametriche |
| EDFL-10         |        6 | Fessure parametriche |
| EDFL-20         |        6 | Fessure parametriche |
| EDFL-30         |        6 | Fessure parametriche |
| EDFL-40         |        6 | Fessure parametriche |
| EDFL-50         |        6 | Fessure parametriche |
| EDFLB-20        |        6 | Fessure parametriche |
| EDFLB-40        |        6 | Fessure parametriche |
| EDFLB-50        |        6 | Fessure parametriche |
| EDFLB-FL        |        8 | Fessure parametriche |
| EDFLNA-10       |        4 | Fessure parametriche |
| EDFLNA-20       |        4 | Fessure parametriche |
| EDFLNA-40       |        4 | Fessure parametriche |
| EDFLNA-50       |        4 | Fessure parametriche |
| EDFLBNA-10      |        4 | Fessure parametriche |
| EDFLBNA-20      |        4 | Fessure parametriche |
| EDFLBNA-40      |        4 | Fessure parametriche |
| EDFLBNA-50      |        4 | Fessure parametriche |
| EDRA            |       12 | Disco/anello         |
| EDRA-PQ         |        7 | Lamelle orizzontali  |
| EDCS            |        5 | Disco/anello         |
| EDCS-PQ         |        5 | Lamelle orizzontali  |
| EDEA-SD         |        5 | Disco/anello         |
| EDCF            |        6 | Disco/anello         |
| EDCC            |        6 | Disco/anello         |
| EDQF1           |        6 | Lamelle orizzontali  |
| EDQC1           |        6 | Lamelle orizzontali  |
| EDQF3           |        1 | Lamelle orizzontali  |
| EDRC            |        5 | Disco/anello         |
| EDRCS           |        5 | Disco/anello         |
| EDRC-PQR        |        3 | Lamelle orizzontali  |
| EDRCS-PQR       |        3 | Lamelle orizzontali  |
| EDRCS THERM     |        5 | Disco/anello         |
| EDRCS-PQR THERM |        2 | Lamelle orizzontali  |
| EDRF            |        6 | Disco/anello         |
| EDRFQ           |        6 | Lamelle orizzontali  |
| EDRFB           |        5 | Disco/anello         |
| EDRFQB          |        5 | Lamelle orizzontali  |
| EDE-FB          |        4 | Lamelle orizzontali  |
| EDQMQ           |        3 | Lamelle orizzontali  |
| EDQMC           |        3 | Lamelle orizzontali  |
| EDMF-S          |        8 | Lamelle orizzontali  |
| EDMP-P          |       45 | Lamelle orizzontali  |
| EDMP-C          |       45 | Lamelle orizzontali  |
| EDQV            |        7 | Lamelle orizzontali  |
| EDQV-PQ         |        4 | Lamelle orizzontali  |
| EDC1            |       20 | Lamelle orizzontali  |
| EDC2            |       20 | Lamelle orizzontali  |
| EDC3            |       20 | Lamelle orizzontali  |
| EDC4            |       20 | Lamelle orizzontali  |
| EDC5            |       11 | Lamelle orizzontali  |
| EDC6            |       11 | Lamelle orizzontali  |
| EDU             |        7 | Disco/anello         |
| EDU-M           |        5 | Disco/anello         |
| EDUB            |        9 | Disco/anello         |
| EDU-F           |        6 | Disco/anello         |
| EDU-S           |        6 | Disco/anello         |
| EDU-SM          |        6 | Disco/anello         |
| EDU-LFS         |        6 | Disco/anello         |
| EDFDS           |        2 | Disco/anello         |
| EVVRC           |        6 | Disco/anello         |
| EVPMC           |        5 | Disco/anello         |
| EAM-VRFN        |        3 | Disco/anello         |
| EDSC-C          |        3 | Disco/anello         |
| EDSC-CC         |        2 | Disco/anello         |
| EDSC-Q          |        2 | Lamelle orizzontali  |
| EGE             |       12 | Lamelle orizzontali  |
| EGFC            |        3 | Lamelle orizzontali  |
| EDLSV           |        2 | Fessure parametriche |
| EGA-ONE         |        8 | Lamelle orizzontali  |
| EAGF            |        3 | Lamelle orizzontali  |
| EAG             |        3 | Lamelle orizzontali  |
| EAL             |        3 | Lamelle orizzontali  |
| EAG-AL          |        8 | Disco/anello         |
| EAG-INOX        |        5 | Disco/anello         |
| EAMV-V          |        3 | Lamelle orizzontali  |
| EVREA           |        5 | Lamelle orizzontali  |
| EVVAIR-C        |        1 | Disco/anello         |
| EVVAIR-Q        |        1 | Lamelle orizzontali  |
| EVVBOR          |        2 | Disco/anello         |
| EVALI           |        8 | Disco/anello         |
| EMV-PFS         |        6 | Disco/anello         |
| EMV-S           |        4 | Lamelle orizzontali  |
| EMV-J           |        3 | Lamelle orizzontali  |
| EMV-BVS         |        3 | Disco/anello         |
| EMV-350         |        1 | Lamelle orizzontali  |
