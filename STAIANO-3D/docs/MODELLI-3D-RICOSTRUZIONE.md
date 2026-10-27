# Modelli 3D: ricerca e ricostruzione

Richiesta: cercare modelli in rete o ricrearli simili, partendo dall'audit del
25 ottobre 2026. Cordivari resta escluso dalla sostituzione delle geometrie.
Le modifiche usano lo stesso renderer della vista 3D, dei panorami e di SketchUp.

## Ricerca dei file originali

| Produttore | Riscontro | Scelta attuale |
| --- | --- | --- |
| Zehnder | Il portale ufficiale indica che i CAD richiedono login; l'archivio AEC-DATA indicato dall'utente elenca Charleston e Nova | Ricostruzione nativa da cataloghi e fotografie ufficiali già archiviati; nessun file CAD importato |
| Innova | Scaricato e ispezionato lo ZIP BIM pubblico AirLeaf SL/RS: contiene tre famiglie Revit `.rfa` | Nessuna mesh direttamente importabile; mantenuta la ricostruzione nativa e le quote dei pannelli |
| LG | Libreria BIM ufficiale in collaborazione con BIMsmith, riferita al mercato USA; nessuna mesh europea dei due codici acquisita | Ricostruzione della cassetta rettangolare europea dal prospetto tecnico |
| Lazzarini | Tavole tecniche pubbliche con tubi, collettori e quantità per taglia; nessuna mesh scaricata | Ricostruzione di Sanremo e Garda |
| Global | Download ufficiali con cataloghi e schede tecniche; nessuna mesh scaricata | Ricostruzione dei frontali e delle testate VIP, OSCAR e OSCAR TONDO |
| Olimpia Splendid | Pagine ufficiali con voci BIM e DWG per alcune famiglie | Conservati corpi e quote dei pannelli già presenti; nessun oggetto BIM convertito |
| Aermec | Scheda FCZ ufficiale con documenti tecnici e varianti di posa | Ricostruzione del corpo arrotondato, ripresa inferiore e griglia superiore longitudinale |
| Gree | Famiglia Revit `GREE_U-Match-Duct-Indoor-Unit.rfa`, U-Match Standard | Convertita in GLB con Innerscene; uso autorizzato dal partner Gree. Mesh rappresentativa, non una conversione parametrica dei singoli modelli |
| Gree | Famiglia Revit `GREE_Outdoor-Unit-VERSATI-III-SP-08-10.rfa` | Convertita in GLB per le pompe VERSATI III Split 8 e 10; escluso il volume BIM dello spazio di servizio |

Fonti online consultate:

- [Zehnder: download e accesso ai CAD](https://www.zehnder-systems.de/de/zuhause-profi/beratung-service/downloads/downloads-heizkoerper).
- [Zehnder Charleston: prodotto ufficiale](https://www.zehnder.it/it/radiatori-decorativi/radiatori/radiatori-idronici/zehnder-charleston-funzionamento-ad-acqua-calda).
- [Zehnder: modifica dei profili Nova](https://zehnder.picturepark.com/service/download/f4b24f643c3e466490f68d268cc298e3).
- [LG: libreria BIM](https://lghvac.com/BIM-library).
- [LG: cassette](https://www.lg.com/global/business/hvac/commercial-solutions/single-split/ceiling-mounted-cassette/).
- [Lazzarini Garda](https://www.lazzariniradiatori.it/en/DECORATIVE/GARDA) e relativa scheda tecnica collegata.
- [Global: download](https://www.globalradiatori.it/download-it).
- [Olimpia Splendid Bi2 Naked](https://www.olimpiasplendid.it/Sistemi-idronici/ventilconvettori-ventilradiatori/bi2-sli-inverter-naked).
- [Aermec FCZ](https://global.aermec.com/en/products/product-sheet/global/50hz/cat_50hz/terminal/hydronic-terminal-units/FCZ/).
- [Innova: disegni e BIM](https://www.innova.it/docs/disegni-e-schemi/), archivio `airleaf_sl_e_rs-bim_objects.zip`.
- [AEC-DATA Zehnder, indicato dall'utente](https://www.aec-data.com/en/download/zehnder/000-81): serie Charleston e Nova.
- [Condizioni AEC-DATA](https://www.aec-data.com/en/licensing-conditions): l'uso non personale, le modifiche e la redistribuzione richiedono consenso scritto del fornitore e citazione della fonte. Nessun modello AEC-DATA viene incluso nel repository o nel pacchetto.
- [Daikin: supporto BIM](https://www.daikin.it/it_IT/cataloghi-e-app/bim.html): oggetti Revit e disegni AutoCAD; nessuna mesh convertita importata.
- [Ecoclima: diffusione](https://www.ecoclima.com/catalogo-generale/diffusione): descrizioni di tipologia e schede di riferimento.

## Stato di implementazione

| Gruppo | Stato | Dettagli e limiti |
| --- | --- | --- |
| Nova Easy: 32 varianti | Implementato | 5/6/7/8 profili da codice, singola/doppia fila e alette distinte; quote salvate invariate. I cataloghi comprendono geometrie precedenti alla variazione produttiva: il profilo visuale resta una ricostruzione |
| Lazzarini Sanremo/Garda: 57 varianti | Implementato | Quantità tubi e diametri da scheda; gruppi con intervalli rappresentativi. Garda con due collettori laterali distanti 50 mm e accessori allineati |
| Lazzarini Empoli: 6 varianti | Ricostruzione già presente | Profili 70×11 mm, specchio e collettori Ø35; dettagli di fissaggio restano illustrativi |
| Charleston: 156 varianti | Implementato | Testate sagomate ripetute per elemento, colonne da catalogo, interasse dei collettori rispettato |
| Global: 19 varianti | Implementato | Frontali quasi continui con giunti stretti, alette posteriori; testate arrotondate distinte per OSCAR TONDO |
| LG cassette rettangolari: 2 modelli | Implementato | Quattro bocche inferiori e ripresa centrale. Pannello rappresentativo contenuto nell'ingombro macchina salvato: non dichiara lo sbordo OEM 620×620 mm |
| Split e cassetta tonda | Implementato per le forme distinte | Cassetta tonda con mandata anulare e ripresa centrale; LG Mirror con frontale riflettente; MSZ-LN con doppia aletta. Conservate le forme Emura/Stylish già presenti; gli altri corpi a parete restano schematici |
| VRV interni | Catalogo risolto correttamente | Il renderer legge anche il catalogo VRV e distingue cassette tonde e rettangolari; i corpi a parete restano rappresentativi |
| Esterne split/VRV e pompe di calore | Implementato per tipologia | Carter con pannello tecnico e prese laterali; griglia circolare, quadrata VERSATIV o schermatura Altherma. Numero di ventilatori illustrativo quando manca un riferimento OEM preciso |
| Ventilconvettori | Implementato | FCZ arrotondato con griglia longitudinale; AirLeaf più piatto. Conservati ingombri e pannelli dei modelli a incasso; dettagli interni illustrativi |
| Terminali Ecoclima | Implementato per tipologia | Schemi distinti di feritoie, elicoidali, forati, ugelli, coni, valvole, reticoli e diffusori a quattro vie. Conteggi interni rappresentativi, salvo le feritoie documentate |
| Canalizzati | Implementato | Mesh Gree U-Match Standard ridimensionata alle quote di ogni macchina e riutilizzata anche per ventilconvettori canalizzabili; marchi rimossi. Le aperture e i dettagli non sono garantiti per ogni modello. Ripiego nativo se la mesh non è disponibile |

La conversione `public/models/gree/u-match-ducted.glb` ha SHA-256
`e754783c792e4c768eb14ba2362506cddd303c39b27ea1e7df476240d4da8c51`.
Il file Revit è stato convertito con il visualizzatore Innerscene: non sono
state verificate tutte le geometrie e le varianti parametriche dell'originale.
La mesh VERSATI III ha SHA-256
`4a470dbf5c373c621da29d70e6816b1e554b17e0285dd1eff33a0cd66ab84121`.

## Correzione della lettura del Garda

L'audit precedente definiva centrale il collegamento da 50 mm. L'ispezione visiva
della pagina 2 della scheda Garda mostra invece entrambi i collettori sullo stesso
lato. La versione standard è destra, quella sinistra è reversibile. La ricostruzione
usa la versione destra; la scelta del lato reversibile non è un nuovo parametro del
progetto. Questa correzione non cambia quote o prestazioni termiche.

## Verifiche

- Suite unit: **141 file, 921 test superati**. Include i 939 ingombri dei radiatori,
  170 carter esterni, oltre 1.500 facce di terminali, conteggi dei profili e dei tubi,
  attacchi, cassette e aperture canalizzate. Conservati i test sulle finiture e sul PDF.
- TypeScript, lint dei file modificati e build di produzione superati.
- Browser Edge: **25 casi mirati verificati**, con confronto dei dati del progetto
  prima/dopo la vista 3D e controllo degli errori JavaScript/console. I due esempi
  Mirror/MSZ-LN sono stati corretti per rispettare la validazione delle potenze:
  sono anteprime del corpo con potenza nominale dell'unità, senza combinazione
  esterna approvata, e restano segnalati come non verificabili.
- Ispezione delle immagini: radiatori, cassette rettangolare/tonda, terminali,
  ventilconvettori, esterne e canalizzato. Corrette le superfici che nascondevano
  griglie e feritoie. Ripetuti e superati i due test split dopo quest'ultima correzione.
- Screenshot conservati localmente in `output/verification/reconstructed-models/`.
- Build di collaudo precedente alla pubblicazione: `9SOVs3lblSi_VMqBI09DE`,
  verificata su `127.0.0.1:3456`.

La suite browser completa del progetto non è stata eseguita; il collaudo riguarda
i flussi modificati. I modelli sono ricostruzioni visuali, non CAD OEM certificati:
fissaggi, suddivisioni interne e dettagli non documentati restano illustrativi.
Quote, ingombri salvati e dati termici non sono stati modificati.

## Consegna locale

EXE provvisorio generato in `dist-exe/StaianoHVAC.exe`: 275.925.504 byte, 117 moduli in
bytecode. Il comando `--version` restituisce `9SOVs3lblSi_VMqBI09DE`; SHA-256
verificato contro `release.json`:

`ed58d0665f811c439d6328bef0ce6005a7ea2fec2845067902edfdff6583c159`.

Tentato anche l'avvio reale dell'EXE in `.cache/reconstructed-exe-smoke/`, con
cartella dati copiata e porta separata: il processo è terminato con codice 1 prima
di estrarre il runtime. Il launcher ha risposto «Aggiornamento obbligatorio: questa
versione non è l'ultima pubblicata». Il controllo in `deploy/executable.cjs`,
`requireCurrentVersion`, confronta il commit incorporato con l'ultima release
autorizzata; non è stato aggirato o modificato per il collaudo.

Il collaudo HTTP/browser riguarda quindi la build Next di produzione usata per
confezionare l'EXE. L'avvio del server confezionato resta bloccato dalla pubblicazione
della versione; il solo consenso UAC non risolve questo requisito.

L'utente ha successivamente autorizzato **pubblicazione GitLab e installazione**.
La procedura deve creare un nuovo EXE dal commit pulito, pubblicarlo tramite
`deploy/build-release.ps1` e installarlo con conferma UAC. Il pacchetto provvisorio
descritto sopra non è la release da distribuire.

La consegna va verificata confrontando `dist-exe/release.json`, il record effettivo
`C:\local-software\StaianoHVAC\application\data\.cache\production-server.json`
e l'header `X-Staiano-Build` sulla porta 3015. Prima dell'aggiornamento la build
installata era `6JpHgTFcRmMtDX1dUiAG3`. Non dichiarare l'app installata aggiornata
sulla base del solo EXE o del collaudo sulla porta separata.
