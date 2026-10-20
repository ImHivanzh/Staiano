---
version: 1
slug: "src-configurator-configurator-tsx"
primary_target: "src/configurator/Configurator.tsx"
related_targets: ["src/app/globals.css","src/configurator/viewer3d/Viewer3D.tsx","src/configurator/viewer3d/Viewer3D.module.css","src/configurator/viewer3d/ProductTools.module.css","src/configurator/properties/inspector.css","src/app/accedi/route.ts"]
---

# Configuratore Staiano HVAC

Modalità: Operate. Priorità confermata: progettazione 2D/3D, spazio al modello e comandi chiari. Sviluppo diretto con verifica desktop e mobile, scelto dall’utente.

## Grounded directions

1. Studio di progettazione: superfici bianche e strumenti compatti; familiare agli operatori, ma vicino alla UI precedente.
2. Pubblicazione architettonica: misure ordinate e ampio respiro; gerarchia precisa, meno densa.
3. Segnaletica Staiano: blu del marchio, accenti ciano e percorsi leggibili; riconoscibile anche senza contenuto.
4. Scheda tecnica di prodotto: superfici fredde, dati tabulari e separatori; utile per cataloghi e proprietà.
5. Segnaletica degli edifici: palette blu e bianco, selezioni nette; orientamento rapido tra piani e stanze.
6. Atlante tecnico degli impianti: blu profondo, bianco e fondo azzurro; l’ambiente selezionato collega navigazione, modello e dati con lo stesso stato cromatico.
7. Indice dei materiali: neutrali minerali e campioni reali; adatto ai prodotti ma meno al disegno quotidiano.

## Direction contract

THESIS: Atlante tecnico. Il modello è lo spazio di lavoro principale; i comandi si raccolgono per compito e non coprono il centro del modello.

OWN-WORLD: Navigazione blu profondo, azioni blu Staiano, selezioni azzurre e superfici bianche. Inter locale per testi e comandi; numeri tabulari per misure. Bordi leggeri, pannelli piatti, ombra soltanto per elementi sovrapposti.

STORY: L’operatore crea o importa la pianta, seleziona un ambiente, modifica i dati e inserisce gli apparecchi senza perdere la vista del progetto. Errori, salvataggio e controlli mantengono significato e visibilità.

FIRST VIEWPORT: Sidebar desktop di 208 px. Intestazione con salvataggio, Avvia/Apri/Riprendi wizard, Nuovo e File. Modifica contiene selezione oggetti, importazione e operazioni; Opzioni 2D raccoglie griglia e agganci. Nel 3D tre menu: Vista 3D, Aspetto e Aggiungi apparecchio. Nessuna barra apparecchi inferiore. Modello centrale, proprietà richiudibili a destra e sotto il canvas su mobile.

FORM: Direzione 6 della lista. Seed 6b4c28d4; direzione scelta su delega esplicita dell’utente. Sviluppo code-led confermato. Firma: selezione coordinata tra ambiente, geometria e proprietà; apertura del pannello prodotti con movimento breve e ridotto con prefers-reduced-motion.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Scope and preservation

Shell, pagina iniziale, accesso, comandi 2D/3D, pannelli prodotti, proprietà e stili condivisi dell’app. Non modificare public/sistema.css, formule, rendering fisico, cataloghi, autenticazione o archiviazione. Conservare modifiche locali precedenti. Nessun raster nuovo richiesto.

## Simplificazione richiesta dall’utente

Feedback: troppi pulsanti in alto e in basso, percorso poco chiaro, pulsante di avvio wizard assente. La configurazione guidata ora si avvia anche senza importare, apre le proprietà e conserva il passaggio già salvato. File raccoglie salvataggio, esportazione e documenti; Modifica raccoglie operazioni sugli oggetti. Menu alternativi si chiudono all’apertura del successivo, con Escape o clic esterno. Palette e dati restano invariati.

## Estensioni consegnate: disegno ed esportazione

Disegno mantiene Muro dritto (L, nome accessibile preesistente “Disegna muro”) e aggiunge Muro curvo (U). Tre clic definiscono inizio, fine e punto di passaggio; l’anteprima accompagna il terzo punto. Escape annulla e Annulla rimuove la curva con una sola operazione. I segmenti condividono curveId per la selezione complessiva e riusano la geometria a corde compatibile con modello, salvataggio, PDF e SKP. Non sono archi analitici per fabbricazione.

File > Scarica modello SKP esporta soltanto il piano attivo e lo sfondo importato calibrato, usando le mesh effettive di architettura, apparecchi, plenum e canali. Il comando mostra lo stato “Preparazione SKP…”; colori geometrici conservati, texture PBR escluse. Il server Windows richiede SketchUp installato e il bridge locale compilato. Il viewer e i render PDF condividono terreno, fondazioni e affinamenti di luce e materiali; la vista cliente segue orbita, zoom e spostamento dell’operatore.

Verifica riferita dal passaggio d’implementazione: 58 test unitari mirati, test browser combinato PDF/SKP/3D/camera e prova disegno/salvataggio/annullamento curva superati. Evidenze visive: `.impeccable/review/curved-walls.png`, `.impeccable/review/customer-view/desktop.png`, `.impeccable/review/customer-view/ipad.png` e `.impeccable/review/scene/house-oak-cutaway.png`. Nessun cambiamento a cataloghi, dati sorgente o calcoli. L’icona Windows deriva dal logo SVG esistente, senza raster generativi.

## Ricostruzione automatica 2D

L'importazione mantiene il mondo visivo esistente e mostra una bozza 2D già selezionata quando il runtime locale Raster2Seq trova una struttura coerente. I muri si allineano alle tracce dell'immagine originale; stanze e superfici usano il motore geometrico del programma. L'operatore conferma una misura reale prima di importare. I varchi visibili restano aperture proposte, con tipo e quote verticali da verificare; tutti gli oggetti restano modificabili. Scanner e dettagli tecnici si richiudono dopo il riconoscimento per lasciare visibili pianta e calibrazione. La chiusura del dialogo annulla il processo locale e rimuove l'immagine temporanea. Senza runtime avanzato resta disponibile il riconoscitore nel browser. Evidenze PC/iPad e importazione: `.impeccable/review/automatic-plan/`. Verifiche: 89 test unitari mirati; importazione di due stanze con aperture, salvataggio/riapertura e annullamento provati nel browser. Nessuna nuova identità, font o immagine generativa.
