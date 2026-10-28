# Revisione dei modelli 3D — 28 ottobre 2026

Il catalogo distribuito contiene 1.725 GLB. La revisione con Blender MCP ha
calibrato le superfici di 1.699 file e 119 sorgenti `.blend`. I 26 asset restanti
sono sezioni senza materiali, geometrie ufficiali o superfici già adeguate;
non sono stati alterati per forzare una differenza.

## Correzioni

- Vernici, ABS, ghisa verniciata e vetri utilizzano superfici dielettriche.
  Alluminio e lamiera zincata conservano la risposta metallica. Maiolica e
  vetro hanno uno strato superficiale lucido; i vetri restano compatibili con
  la fiamma animata dell'app. Colori e texture originali sono conservati.
- Il viewer distingue alluminio naturale, vernice bianca, nera e colori
  personalizzati, anche per radiatori, fancoil e carter esterni procedurali.
- Le lamelle di 123 varianti EGA/EGA1-4 sono inclinate a 45°, mantenendo il
  passo di 25 mm indicato dalla scheda del produttore.
- EDE ed EDE2R hanno rispettivamente 28 e 24 feritoie disposte secondo le foto,
  con aperture passanti nella piastra e deflettori interni. Le proporzioni
  secondarie ricavate dalle foto restano ricostruzioni, non quote di officina.
- Eliminato il cubo iniziale di Blender da 26 esportazioni: 21 split, due
  cassette e tre carter esterni. Il cubo estraneo di 2 m alterava i bounding box
  e quindi la scala dei prodotti nel viewer. I tre generatori esportano ora
  soltanto la scena attiva, oltre alla selezione corrente.

Geometrie, UV, texture incorporate, occlusione, nomi, attacchi e animazioni
rimangono identici durante il passaggio sui materiali. Le sole modifiche
geometriche intenzionali riguardano 123 griglie e due diffusori; la pulizia
dei cubi modifica la gerarchia dei 26 asset coinvolti, senza riscalare i prodotti.

## Confronto fotografico

L'indice associa 1.720 GLB a foto originali di 295 famiglie/configurazioni.
Le varianti dimensionali o cromatiche condividono il riferimento di famiglia.
Sono disponibili 295 render dei GLB effettivamente distribuiti, affiancati
alle foto in 19 tavole locali. Le foto delle stufe accese non costituiscono un
confronto dello stato luminoso con il render a focolare spento.

Cinque asset sono illustrativi e non corrispondono a un singolo prodotto
identificabile: i due plenum generici a tre stacchi e i tre carter esterni.
Le loro superfici sono calibrate, ma non viene dichiarata una corrispondenza
fotografica a un modello commerciale specifico. Le geometrie ufficiali
Cordivari mantengono lo stato di verifica dimensionale già presente in catalogo.

Riferimenti aggiuntivi verificati:

- [Amika AD: acciaio, top in maiolica e vetro curvo](https://www.lanordica-extraflame.com/it/pellet/stufe-pellet/amika-ad).
- [Iside Idro: rivestimento in maiolica](https://www.lanordica-extraflame.com/it/pellet/stufe-pellet/iside-idro-5016).
- [EGA: alluminio, lamelle a 45° e passo 25 mm](https://catalogo.ecoclima.com/uploads/EGA_Scheda_tecnica_REV_1-2024.pdf).
- [Innova Filomuro](https://www.innova.it/prodotti/fancoils/filomuro/) e
  [OSMO SL](https://www.innova.it/prodotti/fancoils/osmo/osmo-sl/).
- [Gree U-Match VI, foto del GUD71 a pagina PDF 6](https://gree-bulgaria.com/manuals/service/U-Match_6_technical_sales_guide.pdf#page=6).

## Riproduzione e verifiche

Gli script si eseguono in Blender tramite MCP, dalla sottocartella `STAIANO-3D`:

1. Rigenerare soltanto le famiglie geometriche modificate, con i generatori in
   `scripts/blender/`. Per EGA usare `ECO_ONLY=EGA,EGA1-4`; il generatore dei
   diffusori accetta `ONLY_MODELS=("ede-square", "ede2-square")` nel contesto
   Python e salva la scena parziale in un file dedicato.
2. Eseguire `scripts/blender/finish-realism.py` dopo i generatori e dopo
   l'eventuale cottura AO. Il passaggio è idempotente e aggiorna i GLB senza
   riesportarne i buffer. Salva `assets/blender/calibrated-surfaces.blend`.
3. Eseguire `scripts/blender/calibrate-source-materials.py` in un processo
   Blender separato: apre i sorgenti, conserva copie e applica la calibrazione
   senza cambiare oggetti o trasformazioni.
4. Eseguire `scripts/blender/review-realism.py` in un processo Blender separato.
   La funzione `make_boards()` dello stesso script compone le tavole con Pillow.

L'output locale e i backup sono in `output/verifiche-realismo/material-pass/`:
`audit.json`, `source-audit.json`, `references.json`, `renders/`,
`confronto-01.jpg` … `confronto-19.jpg`, `originals/`. I backup e i render non
vengono inclusi nell'EXE; gli asset finali sono in `public/models/`.

`realistic-materials.test.ts` verifica tutti i GLB, i materiali dielettrici,
l'importazione dello strato lucido, le lamelle a 45°, le feritoie passanti,
l'assenza del cubo estraneo e le larghezze nominali di split e cassette.
Le altre prove dei modelli controllano ingombri, attacchi, texture e movimenti.
La suite browser copre anteprime, cambio modello, download e configuratore 3D.
