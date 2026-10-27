# Report modelli 3D generici — 27 ottobre 2026

Per «generico» si intende un corpo costruito da primitive nel renderer (`src/configurator/viewer3d/*`, `device-detail.ts`),
non da una mesh Blender/GLB dedicata. Conteggi dai cataloghi in `catalog-data/generated/`.
Le quote, gli ingombri salvati e i dati termici non sono toccati da nessun modello.

## 1. Modelli dedicati (mesh GLB, sorgente Blender in `scripts/blender/` + `assets/blender/`)

| Famiglia | Prodotti | File | Controllo con immagini produttore |
| --- | --- | --- | --- |
| Global **VIP** e **OSCAR** (nuovo) | 12 (VIP 5, OSCAR 7) | `hvac/global-{vip,oscar}-section.glb` | Foto ufficiali `catalog-assets/radiators/global-*.jpg`: elementi a pannello piatto con giunti sottili, tasca superiore, valvola in basso |
| Cordivari Ardesia 2–6 colonne | 135 | `models3d/ardesia-*.glb` (da mesh del produttore) | Dimensioni misurate sulla mesh |
| Ecoclima EGA6, EBL, EGF, EGF-PUSH | griglie | `hvac/*-realistic.glb` | EBL corretto il 27/10; EGA6 corretto ora (14 → 9 lamelle larghe inclinate, come in foto) |
| Ecoclima EDLS, EDFL, plenum laterale / 3 stacchi | feritoie e plenum | `ecoclima/*.glb`, `hvac/plenum-*.glb` | Coerenti (report del 27/10) |
| Innova AirLeaf SLI (nucleo + pannello), Filomuro Slim Fit | 10 + 3 | `hvac/innova-*.glb` | Pannello SLI: 4 feritoie superiori e fascia forata inferiore come in foto |
| Aermec FCZ P / PO | 47 | `hvac/aermec-fcz-p-po-realistic.glb` | Corpo da incasso senza mobile: corretto per P/PO, non per FCZ con mobile |
| Gree U-Match canalizzato (anche per FC canalizzabili) | 7 + usi su FC | `gree/u-match-ducted.glb` | Conversione Revit; mesh unica ridimensionata, aperture non garantite |
| Gree VERSATI III Split 8/10 | 2 | `gree/versati-iii-sp-08-10.glb` | Conversione Revit |
| Pompe di calore Chaffoteaux Arianext (3 altezze), Gree VERSATI III (2) e V (2), Daikin Altherma 3 M (2) e 3 R / R MT / H HT (3) | 61 | `hvac/heat-pump-*.glb` (12 file, `scripts/blender/heat-pump-outdoor-units.py`, `assets/blender/heat-pump-outdoor-units.blend`) | Foto `catalog-assets/heat-pumps/*`: colore, corpo, pannello tecnico, piedi e tipo di griglia confrontati in render affiancato; mappa famiglia→file in `heat-pump-models.ts`, test su tutti i 61 prodotti. Numero e posizione delle ventole di Arianext 1106/1506 e dei Daikin sono indicativi (nessuna vista frontale) |
| Innova OSMO SL | 0 | `hvac/innova-osmo-sl*.glb` | **Non nel catalogo**, modello non selezionabile |

## 2. Modelli generici (primitive nel renderer) — elenco completo

### Radiatori (≈1.100 varianti generiche)
| Gruppo | Varianti | Realismo attuale | Priorità |
| --- | --- | --- | --- |
| Global OSCAR TONDO | 7 | Pannelli piani a tutta altezza come VIP/OSCAR (calotte tonde tolte dopo il confronto con la foto), senza mesh | Bassa |
| Zehnder Charleston / Nova (tubolari) | 312 | Ricostruzione da codice (tubi, testate, collettori), geometria «published» | Bassa |
| Zehnder Nova Easy verticale (`panel`) | 32 | Elementi a sezione piena con alette posteriori | Bassa: confrontato con la foto, coerente |
| Cordivari scaldasalviette (Claudia, Anna, Naike, Lucy, Gloria, Dory, Daria, Katia, Samira, Lisa, Tamara…) | 577 | `towel`, 473 con geometria **schematic** | Alta per volume: barre ripetute, nessun profilo reale |
| Cordivari Tamara verticale (`panel`) | 9 | Tubi ovali verticali separati a testa tonda, senza collettori tondi (come la foto) | **Corretto** (`device-detail.ts`, test dedicato) e riverificato nel viewer reale con la foto: 8 tubi ovali a testa tonda, valvole in basso. Il primo tentativo aveva i tubi lunghi metà (lunghezza del cilindro = `scale[1]`): trovato solo nel viewer, corretto e coperto da test |
| Lazzarini Sanremo / Garda / Empoli | 126 (98 schematic, 12 decorative) | Tubi da scheda, spaziature illustrative | Media |

### Terminali e griglie Ecoclima (127 famiglie)
Solo EGA6, EBL, EGF, EGF-PUSH, EDLS, EDFL hanno mesh. Gli altri 100+ (griglie 45, diffusori 54, valvole 8, lineari 20 meno i due sopra)
usano schemi per tipologia: feritoie, elicoidali, forati, ugelli, coni, reticoli, quattro vie. Conteggi interni rappresentativi.

### Climatizzazione
| Gruppo | Prodotti | Nota |
| --- | --- | --- |
| Split a parete (Daikin Perfera/Comfora/Sensira, Mitsubishi MSZ-AY/HR/EF, Gree Pular/Clivia/Airy, LG Standard Plus/Standard 2/Deluxe/Air Purification/DUALCOOL…) | ≈90 | Box arrotondato + alette; forme distinte solo per Emura, Stylish, Mirror, MSZ-LN |
| Cassette LG (rettangolare e tonda) | 3 | Forme distinte da prospetto tecnico, nessuna mesh |
| Unità interne VRV / Sky Air / PEAD | 21 | Corpo parete/cassetta rappresentativo |
| Unità esterne split e VRV | tutte | Carter con pannello tecnico, ventola circolare o quadrata; numero ventole illustrativo |
| Pompe di calore | 61 | Tutte con mesh GLB (sez. 1); il carter generico resta solo come ripiego se il file non carica |

### Ventilconvettori
| Gruppo | Prodotti | Nota |
| --- | --- | --- |
| Aermec FCZ con mobile | 19 | Corpo arrotondato con griglia longitudinale da codice; la foto mostra piedini cilindrici e griglia curva sulla testa, non riprodotti |
| Innova AirLeaf SL / SLS / RSI / SLSI | 25 | Corpo piatto da codice |
| Olimpia Splendid Bi2 Air / Smart / Naked | 22 | Corpo da codice |

## 2b. Inventario di tutte le categorie dell'app

| Categoria | Prodotti | Rappresentazione 3D | Confronto con le foto |
| --- | --- | --- | --- |
| Radiatori Global VIP / OSCAR | 12 | GLB da Blender, valvole sulle connessioni | Fatto |
| Radiatori Global OSCAR TONDO | 7 | Primitive, pannelli piani | Fatto, corretto |
| Radiatori Cordivari / Zehnder / Lazzarini | ≈1.100 | Primitive da scheda | Fatto per scaldasalviette, Sanremo/Garda, Charleston (sez. 3c); Zehnder «pannello» = Nova Easy verticale (32) e Lazzarini Empoli: coerenti con le foto (`confronto-fancoil-radiatori.png`). Cordivari «pannello» = solo Tamara verticale (9), confrontata con `cordivari-tamara.jpg` e **corretta** (tubi ovali, niente collettori tondi); le altre famiglie Cordivari non Ardesia (Claudia, Lisa 22 e le 19 di `cordivari-range`) sono scaldasalviette, foto controllate a vista |
| **Stufe** (La Nordica Extraflame 111, Ravelli 59) | 170 | **Nessun modello 3D**: solo scheda catalogo e foto, non c'è posizionamento nel progetto | Non applicabile: nessuna geometria da confrontare |
| Ventilconvettori Aermec FCZ, Innova, Olimpia | 47 + 19 + 25 + 22 | GLB per FCZ P/PO, SLI, Filomuro; primitive per il resto | FCZ con mobile e Filomuro corretti; Innova SL/SLS e Olimpia Bi2 confrontati e corretti (frontale liscio, griglia di ripresa bassa); **RSI/SLSI senza foto di confronto**; Bi2 Air e Smart solo disegni di scheda |
| Split a parete | ≈90 | Primitive con varianti per serie | Foto di tutte le 21 serie viste: coerenti; **corrette** le finiture Gree Airy (alluminio) e LG Mirror (nero) |
| Cassette LG (rettangolare, tonda) e unità interne VRV | 3 + 7 | Primitive dedicate (`cassette-detail.ts`); VRV FXAA-A è a parete | Cassette: struttura coerente (anello scuro e griglia), maglia esagonale della tonda semplificata. FXAA-A: la foto è un'unità a parete, coerente con il corpo generico |
| Unità esterne e pompe di calore | ≈59 + VRV | Carter con ventole, schermo per Altherma 3 R MT / H HT, nero per VERSATI V | Daikin, Gree, Chaffoteaux confrontati con le foto: ventole, colore e numero di ventole coerenti, griglia fitta non riprodotta |
| Terminali Ecoclima (127 famiglie) | 127 | Schemi per tipologia + 6 GLB | **Tutte le 127 viste** su 7 fogli (`output/verifiche-realismo/ecoclima-terminali/`): corretti EDE1, bocchette a doppia deflessione, multiugelli, pale radiali (sez. 3d) |
| Canalizzati, plenum, canali flessibili | – | GLB e primitive | Plenum e U-Match controllati il 27/10; canali flessibili: colore portato al grigio scuro delle condotte flessibili (foto non disponibile, controllo solo sul colore) |

## 3. Correzioni fatte in questa sessione: Global VIP / OSCAR

**Problema.** I GLB esistenti (`global-vip-realistic.glb`, `global-oscar-realistic.glb`) non erano usati dall'app: i radiatori Global
erano disegnati da box (`radiatorDetail`). Inoltre i modelli avevano 10 elementi fissi, altezza 600 mm (il catalogo dà 690 per VIP 600 e
1246 per OSCAR 1200), profondità 97 mm (catalogo 95) e valvola, tappo e sfiato fusi nella mesh, quindi non adattabili.

**Soluzione.**
- `scripts/blender/global-radiators.py -- vip|oscar` produce **un solo elemento** fuso (80 mm di passo, 95 mm di profondità, centrato, fronte verso +Z)
  in `public/models/hvac/global-{vip,oscar}-section.glb` e un `.blend` di controllo a dieci elementi con le valvole (`assets/blender/global-{vip,oscar}-realistic.blend`).
  I due vecchi script e GLB sono sostituiti.
- `src/domain/catalogs/global-sections.ts`: `globalSectionFor` abilita la mesh solo per VIP/OSCAR con quote identiche al catalogo;
  `globalSectionVertexY` allunga solo la parte piana del pannello (zone di estremità di 55 e 85 mm invariate), quindi funziona per tutte le altezze (VIP 440–890, OSCAR 946–2046).
  Test in `global-sections.test.ts` (copertura di tutte le varianti, estremità rigide, quote modificate rifiutate).
- `GlobalBody.tsx`: ripete l'elemento `elements` volte con il materiale/colore scelto nel progetto.
- `RadiatorHardware.tsx`: per Global le valvole (valvola + detentore) vanno **sulle connessioni laterali inferiori**, all'altezza `interasse/2` dal bordo, come in foto
  (prima erano cilindri verticali sovrapposti al corpo). Colori da finiture di progetto invariati (valvola, detentore, copritubo); aggiunto lo sfiato superiore.
- OSCAR TONDO: dopo il confronto con la foto ufficiale il disegno da codice usa pannelli piani, senza le calotte tonde per elemento (`device-detail.ts`, test aggiornato).

**Verifica.** Render Blender dei due `.blend` confrontati con le foto; `tsc` e ESLint puliti; vitest mirati (`global-sections`, `device-detail`) 22/22;
Playwright su dev server con `radiator-wizard.hvacproj` (VIP 14 elementi, 690 mm): `global-vip-section.glb` caricato (HTTP 200), nessun errore console, elementi
separati e valvole visibili in basso. **Non verificato**: confronto 3D ravvicinato frontale nell'app (la telecamera non è stata inquadrata abbastanza vicino) e render OSCAR nell'app;
nessun test e2e completo.

## 3b. Verifica di tutti i .blend con Blender (server MCP) contro le immagini dei produttori

Ogni `.blend` è stato aperto e renderizzato dall'istanza Blender collegata via MCP (Eevee, ortografica) e confrontato con la foto ufficiale
(`catalog-assets/*`, `catalog-data/sources/ecoclima/complete-*-image.*`). Render in `output/verifiche-realismo/` e nella cartella temporanea di sessione.

| .blend | Foto di riferimento | Esito |
| --- | --- | --- |
| global-vip / global-oscar | `global-vip.jpg`, `global-oscar.jpg` | Ricostruiti (sez. 3). OSCAR 10 elementi renderizzato: valvole in basso, sfiato in alto, giunti sottili |
| ecoclima-grilles — EGA6 | `complete-ega6` | **Corretto**: 9 lamelle larghe a 45° (erano 14 sottili) |
| ecoclima-grilles — EBL | `complete-ebl` | Già corretto il 27/10 (10 barre + distanziali) |
| ecoclima-grilles — EGF, EGF-PUSH | `complete-egf`, `complete-egf-push` | Coerenti: telaio a 45°, pannello forato esagonale; la botola si apre come in foto. Fori più fitti della foto (≈65 contro ≈45 per riga), lasciato |
| edfl-realistic | `complete-edfl` | Coerente (la foto mostra 2 feritoie, il modello è la variante a 3; 1–6 generate) |
| edls-realistic / edls-plenum-laterale | `complete-edls` | Coerente col profilo; le ali forate in gesso restano nascoste (dichiarato) |
| innova-sli-core / innova-sli-panel | `innova-sli.jpg` | Pannello coerente (4 feritoie, fascia forata). Nucleo interno non fotografato |
| innova-filomuro | foto ufficiali Innova (`3_definitivo_-_filomuro_slim_fit`, `vista_9`) | **Ricostruito dalle foto**: frontale liscio, due sottili feritoie nella metà inferiore (29%–89% della larghezza), display a sinistra; tolte la griglia superiore e l'apertura bassa inventate. Resta non riprodotto l'arrotondamento degli spigoli |
| innova-osmo-sl | — | Fuori catalogo, non collegato all'app |
| aermec-fcz (P/PO) | `aermec-fcz.png` | Corretto per P/PO (senza mobile). Il mobile FCZ della foto (piedini, testa curva) non è in nessun .blend |
| gree-gud71 | solo conversione BIM `output/gree-bim/canalizzato.png` | Coerente con il BIM; nessuna foto prodotto nel repo |
| plenum-multi | nessuna foto | Schematico per dichiarazione |
| modelli-hvac.blend (raccolta originaria) | — | Superato dai file «realistic»; non toccato |

### 3c. Generici confrontati in Blender con le foto dei produttori

Per ogni famiglia generica con foto, `scripts/blender/generic-families-review.py` e `generic-towel-review.py` ricostruiscono in una scena di review
(senza toccare la scena aperta) ciò che il renderer disegna, con le stesse primitive e quote; render in `output/verifiche-realismo/generic-*.png`,
confronto con la foto del produttore (`public/catalog-assets/*`, `catalog-data/sources/ecoclima/complete-*-image.*`, sito Innova).

| Famiglia (varianti) | Foto | Differenza trovata | Esito |
| --- | --- | --- | --- |
| Cordivari scaldasalviette `towel` (473+) | `cordivari-claudia.jpg` | collettori tondi, barre uniformi | **Corretto** collettori piatti (`device-detail.ts`). Aperto: fasce di barre e sezione ovale (passo reale non nei dati) |
| Lazzarini Sanremo / Garda (126) | `lazzarini-sanremo.jpg` | nessuna sostanziale: collettori rettangolari, barre a gruppi | Coerente |
| Zehnder Charleston (312) | `zehnder-charleston.png` | testate quadre separate per tubo; la foto ha tubi più fitti | Coerente nella forma, spaziatura indicativa |
| Global OSCAR TONDO (7) | `global-oscar-tondo.jpg` | il codice sporgeva con calotte tonde sopra e sotto; la foto mostra pannelli piani a tutta altezza | **Corretto**: calotte tolte, test aggiornato |
| Aermec FCZ con mobile (19) | `aermec-fcz.png` | blocco bianco arrotondato senza griglia scura né piedini | **Corretto**: griglia superiore grigia e due piedini cilindrici dentro l'ingombro (`FanCoilMeshes.tsx`) |
| Split a parete (≈90), tutte le serie | 21 foto in `catalog-assets/splits` (Daikin, Mitsubishi MSZ, Gree, LG) | corpo, feritoia e aletta coerenti con tutte; Gree Airy è in alluminio spazzolato e LG Mirror è nero, il codice li faceva bianchi | **Corretto** il colore (`splitFinish` in `DeviceMeshes.tsx`); display non aggiunto |
| Cassette LG e VRV FXAA-A | `lg-4-way-cassette.png`, `lg-round-cassette.png`, `daikin-fxaa-a.jpg` | cassetta: anello scuro e griglia centrale coerenti, maglia esagonale della tonda semplificata; FXAA-A è un'unità a parete come il corpo generico | Coerente |
| Unità esterne / pompe di calore (Daikin, Gree VERSATI III/V, Chaffoteaux Arianext) | `heat-pumps/*`, `vrv/*` (14 foto) | carter generico con ventola tonda: manca griglia, pannello tecnico, colore per serie (Arianext bianco con ventaglio, Versati V nero, Altherma 3 R lamellare scuro) | **Rifatti con Blender**: 12 GLB per le 61 varianti, con griglia a fili o a lamelle, pannello tecnico e piedi come in foto |
| Ecoclima EDE1 (diffusore elicoidale) | `complete-ede1` | una sola corona di feritoie tangenziali; la foto ha feritoie radiali su più corone | **Corretto**: due corone radiali sfalsate (`terminal-detail.ts`) |
| Ecoclima EGQ / EGQR (griglia a quadrotti) | `complete-egq` | nessuna: cornice più maglia ortogonale | Coerente |
| Ecoclima EDU (ugello a sfera) | `complete-edu` | schema a foro e anelli; il vero ugello è una calotta orientabile | Schematico dichiarato |
| Innova Filomuro | foto sito Innova | griglie inventate | **Rifatto** (sez. 3b) |
| Gree GUD71 (7) | nessuna foto prodotto nel repo né nei risultati web (solo schede tecniche, 889×340×660 mm) | solo conversione BIM, mesh unica ridimensionata | **Non verificabile con foto**; le quote vengono dalla scheda |

Le ricostruzioni sono fedeli al codice per le primitive, ma non sono un'esportazione del viewer: il confronto è visivo.

### 3f. Scaldasalviette Cordivari nel viewer reale (stessa build, porta 3016)

Montaggio foto ufficiale / viewer in `output/verifiche-realismo/confronto-cordivari-viewer.png` (Tamara, Claudia, Naike Square, Samira, Anna, Lucy 25;
prodotto reale del catalogo, altezza vicina a 1,5 m, 8+ elementi). Prima del controllo il viewer disegnava per tutte le famiglie la stessa scala di barre tonde equidistanti
(corretto solo per la Claudia). **Corretto in `device-detail.ts`**: Naike, Anna, Lucy e Gloria hanno ora 5 fasce di barre separate da uno spazio, Samira 3 fasce di lamelle piatte
(test dedicato). Numero e distanza delle fasce sono **illustrativi**, ricavati dalle foto, perché le schede non li riportano (`shortcut:` nel codice). Dory, Daria, Katia e le altre famiglie
restano a barre uniformi: non confrontate una per una. Il confronto è con le foto, nel viewer; non è stato rifatto in Blender.

### 3e. Pompe di calore: verifica nel viewer reale (build nuova)

Build di `.next-update` avviata su una porta separata (3016, `next start`) e aperta con Playwright/Edge con il flusso di `tests/heat-pump-movement.spec.ts`:
per ciascuno dei 12 file è stato creato un progetto con una pompa di calore, aperto il 3D, selezionata la pompa ed eseguito il click su «Vista ventilatore».
Per ciascuno dei 12 file il viewer ha richiesto e ricevuto (HTTP 200) il GLB corretto; le schermate sono in `output/verifiche-realismo/viewer/` e nel montaggio
`output/verifiche-realismo/viewer-pompe-di-calore.png` (la pompa selezionata è tinta di azzurro dal viewer, e l'etichetta marca/modello copre parte del fronte).
Il dodicesimo (Versati III 787 mm) è stato aperto con la variante All in One 787 mm (GLB `heat-pump-gree-versati-iii-787.glb` ricevuto con 200); lo Split 8/10 usa di proposito il modello Revit. Quindi tutti i 12 file sono stati caricati nel viewer. Controllo a parte con three.js: larghezza e altezza dei GLB coincidono con il catalogo.
La porta 3015 serve ancora l'EXE installato con la sua build: i modelli nuovi vi arrivano solo con `compila.bat`.

### 3d. Terminali Ecoclima: controllo di tutte le 127 famiglie

Ogni faccia è stata resa in Blender con le stesse primitive e lo stesso ordine di disegno di `DeviceMeshes.tsx`
(`scripts/blender/ecoclima-terminals-review.py`) e affiancata alla foto Ecoclima (`complete-*-image`) nei 7 fogli di
`output/verifiche-realismo/ecoclima-terminali/`. Per 15 famiglie la foto manca (EDFLBNA, EGA1-4, EDC1-6, EDE1R/2R, EDRFQ/EDRFQB):
per queste vale la foto di famiglia o nessun controllo.

| Tipologia | Esito |
| --- | --- |
| Feritoie, lamelle, griglie a maglia, forate, quattro vie, EDQF3/EGF* | Coerenti con le foto |
| Bocchette a doppia deflessione EBA, EBV, EBCV, EBIA | **Corrette**: ora maglia ortogonale (barre orizzontali e verticali) invece di sole lamelle |
| Elicoidali EDE1/EDE2/EDE5 | **Corretti**: feritoie radiali su due corone (EDE-FB ha pale curve, resta schematico) |
| Multiugelli EDQMQ, EDQMC, EDMP-P, EDMF-S, EDMP-C | **Corretti**: file di fori piccoli e fitti al posto di pochi dischi grandi |
| Diffusori a pale regolabili EDRC, EDRCS, EDRF, EDRFB, EDFDS (+ varianti PQ, THERM) | **Corretti**: nuovo schema «vanes» a pale radiali al posto degli anelli concentrici; contrasto più scuro della foto |
| Coni (EDCS, EDRA, EDEA-SD, EMV-PFS), ugelli EDU*, EDUB | Schematici dichiarati: la foto è una calotta o un cono 3D, il renderer disegna anelli |
| Valvole EVVMC, EDSC-Q, EAMV-V | Schematiche: disco e anello scuro, la foto mostra valvole coniche o a piatto |
| EGE, EGA-ONE, EADD, EVREA | Differenze minori non corrette (dettagli di cornice) |


## 4. Cosa resta (ordine consigliato)
1. Cordivari scaldasalviette (577 varianti schematiche): profili reali dalle schede, un elemento per famiglia come per Global.
2. Aermec FCZ con mobile (19): fatti griglia grigia e piedini; resta la testa curva della foto.
3. Global OSCAR TONDO (7): deciso, segue la foto (pannelli piani); resta solo la pipeline GLB come per VIP/OSCAR.
4. Split a parete per serie: forma e colore ora seguono le foto; un corpo per serie (display, griglie) richiede prospetti per famiglia.
5. Stufe (170): nessun modello 3D né posizionamento nel progetto; richiede una decisione di prodotto prima di modellare.
6. Gree GUD71: serve una foto ufficiale per verificarlo.
7. Ecoclima coni, ugelli e valvole: modelli a rilievo (calotte) al posto degli anelli.

Limiti noti: le mesh sono ricostruzioni visive, non CAD certificati; nessun file BIM del produttore è stato importato in questa sessione.
