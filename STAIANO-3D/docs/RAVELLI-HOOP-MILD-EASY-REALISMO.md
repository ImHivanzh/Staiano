# Ravelli Hoop, Mild ed Easy — revisione in corso

Scopo: cinque prodotti del catalogo, dodici finiture, sorgente `assets/blender/stufe-ravelli-hoop-mild-easy.blend` e GLB effettivamente usati dall'anteprima. Ricostruzione visiva di prodotti nuovi, non CAD di fabbricazione. Dimensioni e diametro fumi dal catalogo tecnico; isolanti, tolleranze e dettagli nascosti non sono certificati.

## Brief e analisi dei riferimenti

- Destinazione: catalogo WebGL desktop, asset statici con fiamma applicata al vetro dal viewer. Scala 1 unità = 1 m, fronte -Y in Blender, asse verticale Z; GLB +Y verticale. Budget massimo 15.000 triangoli, quattro materiali, AO incorporata 512×512. Nomi italiani esistenti conservati per compatibilità con gli asset del progetto. Nessuna animazione delle porte richiesta da questo flusso.
- Riferimenti: fotografie del produttore in `public/catalogs/stoves/ravelli-{hoop-7,hoop-9,mild,easy-7,easy-9}.jpg`. Provenienza nelle rispettive voci di `src/domain/catalogs/stoves.json`.
- Hoop: corpo alto rettangolare con angoli arrotondati in pianta, fronte nero continuo, lato superiore bianco/bronzo fino a circa metà altezza, capsula verticale scura con zona di visione inferiore, tetto con feritoie.
- Mild: corpo basso in ghisa, quattro piedi rastremati, ampio vetro con angoli raccordati, cornice e maniglia laterale, bordo superiore e presa d'aria orizzontale. Il lungo tubo della fotografia è un accessorio illustrativo: si conserva solo il collare nell'ingombro nominale.
- Easy: fianchi in lamiera verniciata, sportello nero alto e stretto, vetro rettangolare verticale, cassetto inferiore separato, maniglia destra, apertura superiore e coperchio serbatoio.
- Palette campionata dalle foto (colori osservati, non albedo misurate): bianco Hoop `#eeeeec`, corpo `#2b2a28`, maschera vetro `#3f3e3c`, bronzo `#57473a`, ghisa illuminata `#7f7f7f`, fianco Easy in ombra `#bababa`. I materiali restano PBR distinti; le foto con fiamma non determinano il colore del vetro spento.
- Inquadratura: tre quarti da destra, leggermente rialzata, tele/ortografica, soggetto intero. Luce studio principale da sinistra e riempimento morbido, nessuna usura. Le immagini di controllo conservano uno sfondo neutro per leggere le superfici.

## Differenze trovate e correzioni

| Area | Prima | Correzione |
|---|---|---|
| Hoop | Porta rettangolare con smusso limitato dallo spessore | Sagoma a capsula costruita nel piano frontale; apertura e vetro arretrato |
| Hoop | Due blocchi colorati parziali | Rivestimento superiore continuo sui fianchi e fronte nero distinto |
| Hoop | Barrette appoggiate sopra un tetto chiuso | Feritoie che attraversano coperchio e corpo sottostante |
| Mild | Corpo corto e vetro piccolo, tubo illustrativo nella sagoma | Corpo e piedi riproporzionati, collare corto da catalogo |
| Easy | Vetro piccolo e fianchi con smusso verticale eccessivo | Profili raccordati in pianta, sportello e vetro riproporzionati |
| Scala Easy | HTML dichiara cm per valori in mm: ingombro decuplicato | Due PDF ufficiali archiviati e verificati, ingombro 525×1030×480 mm |
| Normali | Raccordi e booleane generavano falsi riflessi triangolari | Piani con normali piatte e raccordi corti interpolati separatamente |
| Controllo fotografico | Alcuni prodotti larghi uscivano dall'immagine | Inquadratura calcolata sui vertici proiettati, margine verificato |

## Provenienza delle quote Easy

Le pagine HTML archiviate riportano `Dimensioni H x L x P (cm): 1030 x 525 x 480`. Le schede tecniche ufficiali, pagina 1, dichiarano invece esplicitamente millimetri. Non è stata usata una correzione euristica generale.

- [Easy 7, scheda Ravelli](https://ita.ravelligroup.it/wp-content/uploads/2.2-Datasheet-Ravelli-Easy7.pdf), SHA-256 `25b3fceefaf38451e3eec50dfc0806bb46ea80b7d5753a7beafa9ef8f1ee23d2`.
- [Easy 9, scheda Ravelli](https://ita.ravelligroup.it/wp-content/uploads/2.2-Datasheet-Ravelli-Easy9.pdf), SHA-256 `78d2227cca93ef89bdaabc413f8a76299e49e129989f6ddcc4de502302d6dd7a`.

`catalog-data/curation/stoves-technical-sources.json` conserva la correzione e le fonti. L'importatore controlla hash, modello, pagina, unità e ordine H/L/P prima di applicarla, mantenendo gli altri dati di catalogo invariati. La rigenerazione futura non deve ripristinare la scala errata.

## Verifica

Rigenerati i dodici GLB con `ravelli-hoop-mild-easy.py` e rifiniti con `finish-stoves.py` (UV vetro, AO). Ingombri verificati dallo script (entro 2,1 mm), triangoli 3.448–8.528 (budget 15.000), quattro materiali per modello. Il collare fumi del Mild ha ora una UV come le altre parti nere: prima l'export duplicava il materiale (cinque). `npx vitest run src/configurator/viewer3d/stove-models.test.ts`: 386 test superati. Render Cycles di Hoop 7 e Mild confrontati con le foto ufficiali. Non controllata l'anteprima nel browser.
