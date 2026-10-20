---
name: Staiano HVAC
description: Atlante tecnico per progettare impianti, con modello centrale e comandi contestuali.
colors:
  tinta: "#365aa8"
  tinta-scura: "#294781"
  tinta-tenue: "#edf2fc"
  tinta-linea: "#c0cfea"
  sfondo: "#edf2f6"
  carta: "#ffffff"
  carta-2: "#f4f7fa"
  carta-3: "#eaf0f5"
  bordo: "#dfe6ed"
  bordo-forte: "#bac8d6"
  testo: "#183249"
  testo-tenue: "#516679"
  testo-fioco: "#617589"
  nav-alto: "#183249"
  nav-basso: "#24455e"
  nav-testo: "#bbcfdf"
  selezione-ciano: "#69cafa"
  verde: "#2f7d3c"
  verde-tenue: "#e9f6ea"
  ambra: "#b45309"
  ambra-tenue: "#fdf3e3"
  rosso: "#c62828"
  rosso-tenue: "#fdeeee"
typography:
  display:
    fontFamily: 'Inter, "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif'
    fontSize: "clamp(30px, 3.4vw, 44px)"
    fontWeight: 650
    lineHeight: 1.15
    letterSpacing: "-0.03em"
  title:
    fontFamily: 'Inter, "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif'
    fontSize: "19px"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  body:
    fontFamily: 'Inter, "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: '"cv11", "ss01"'
  label:
    fontFamily: 'Inter, "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif'
    fontSize: "12.5px"
    fontWeight: 600
  button:
    fontFamily: 'Inter, "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif'
    fontSize: "13.5px"
    fontWeight: 550
rounded:
  control: "6px"
  group: "8px"
  product: "10px"
  panel: "14px"
  dialog: "20px"
  dialog-tablet: "16px"
spacing:
  compact: "4px"
  tight: "8px"
  control: "12px"
  section: "16px"
  panel: "20px"
  wide: "24px"
components:
  button-primary:
    backgroundColor: "{colors.tinta}"
    textColor: "{colors.carta}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "0 15px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.tinta-scura}"
    textColor: "{colors.carta}"
  button-secondary:
    backgroundColor: "{colors.carta}"
    textColor: "{colors.testo-tenue}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "0 15px"
    height: "36px"
  button-selected:
    backgroundColor: "{colors.tinta-tenue}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.control}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.testo-tenue}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "0 15px"
    height: "36px"
  input:
    backgroundColor: "{colors.carta}"
    textColor: "{colors.testo}"
    rounded: "{rounded.control}"
    padding: "0 11px"
    height: "38px"
  navigation:
    backgroundColor: "{colors.nav-alto}"
    textColor: "{colors.nav-testo}"
    width: "208px"
  navigation-active:
    backgroundColor: "{colors.nav-basso}"
    textColor: "{colors.carta}"
    rounded: "{rounded.control}"
    padding: "10px"
  product-card:
    backgroundColor: "{colors.carta}"
    textColor: "{colors.testo}"
    rounded: "{rounded.product}"
    padding: "9px"
  product-panel:
    backgroundColor: "{colors.carta}"
    textColor: "{colors.testo}"
    rounded: "{rounded.panel}"
    width: "360px"
---

# Design System: Staiano HVAC

## Overview

**Creative North Star: "Atlante tecnico"**

Blu profondo per orientarsi, superfici bianche per leggere, fondo freddo per disegnare. Il sistema mantiene il marchio Staiano e usa una gerarchia compatta, adatta alla progettazione quotidiana.

La selezione collega navigazione, geometria e proprietà. Il colore segnala azioni e stati; bordi e gruppi distinguono i comandi senza aggiungere decorazione al modello.

**Key Characteristics:**

- Modello centrale, wizard visibile e comandi secondari nei menu per attività.
- Inter locale, testi italiani e misure tabulari.
- Selezione coordinata tra ambiente, canvas e proprietà.
- Pannelli prevalentemente piatti, sovrapposizioni con ombra leggera.

## Colors

Palette fredda: blu del marchio, navigazione profonda, azzurri di selezione e neutrali chiari. I valori normativi sono nel frontmatter.

### Primary

- **Blu Staiano — tinta:** azioni principali, strumenti selezionati, quote e collegamenti.
- **Blu profondo — tinta-scura:** hover delle azioni principali e testo negli stati attivi.
- **Azzurro lieve — tinta-tenue:** ambienti selezionati, pulsanti contestuali e prodotti scelti.
- **Azzurro di contorno — tinta-linea:** bordi di selezione e campiture tecniche.

### Secondary

- **Ciano di orientamento — selezione-ciano:** icone attive nella navigazione.

### Neutral

- **Blu atlante — nav-alto e testo:** navigazione e testi principali.
- **Blu di percorso — nav-basso:** ambiente e voce attivi nella barra laterale.
- **Azzurro di lettura — nav-testo:** testi secondari sul fondo scuro.
- **Fondo freddo — sfondo:** spazio del viewer e fondo generale.
- **Bianco — carta:** pannelli, campi e stanze.
- **Carta fredda — carta-2 e carta-3:** canvas 2D, risultati e stati di hover.
- **Bordi — bordo e bordo-forte:** separatori e contorni dei campi.
- **Testi secondari — testo-tenue e testo-fioco:** istruzioni, unità, metadati.

Verde, ambra e rosso conservano il significato di esito valido, avviso ed errore; le rispettive varianti tenui sostengono gli avvisi.

**The Selezione Rule.** Riutilizzare gli azzurri di selezione tra navigazione, geometria e controlli contestuali.

## Typography

**Display Font / Body Font:** Inter variabile locale, con fallback definiti nel frontmatter. Lo stesso carattere è caricato dalla pagina di accesso.

**Character:** Un solo carattere per titoli, comandi e dati. La gerarchia deriva da scala e peso; le misure usano numeri tabulari.

### Hierarchy

- **Display:** titolo iniziale fluido, bilanciato e limitato a 18ch.
- **Title:** titolo del progetto; su telefono scende a 17px. Titoli di archivio e pagina a 24px, pannello prodotti a 23px.
- **Body:** testo generale. Istruzioni e metadati adottano spesso 11–13px; descrizioni distese usano interlinea 1.6–1.7.
- **Label:** etichette dei campi. Comandi del viewer a 12px; pulsanti piccoli a 12.5px.
- **Dati:** proprietà dell'ambiente a 19px, valori secondari e quote con numeri tabulari.

**The Misure Rule.** Usare numeri tabulari per quote, fabbisogni, riepiloghi e valori incolonnati.

## Layout

Il guscio occupa l'altezza della finestra. Desktop: navigazione di 208px, intestazione con altezza minima di 72px, canvas flessibile e proprietà a destra, larghe tra 300 e 340px. Chiudere le proprietà restituisce l'intera colonna al modello.

L’intestazione rende visibile l’avvio del wizard e raccoglie salvataggio, esportazione e documenti nel menu File. Modifica contiene selezione oggetti, importazione e operazioni; Opzioni 2D raccoglie griglia e agganci. Nel 3D tre menu — Vista 3D, Aspetto, Aggiungi apparecchio — sostituiscono le barre permanenti. Cataloghi e configurazioni complesse si aprono in un popup nativo centrato, con angoli arrotondati e sfondo del progetto visibile: impianti della stanza, macchine, plenum, percorsi, importazione planimetria, distinta materiali e anteprima PDF. L’intestazione resta visibile durante lo scorrimento; Esc o un clic esterno chiudono solo il popup corrente e restituiscono il focus al comando di apertura. Apertura in 200 ms con comparsa e lieve salita; nessuna animazione quando è richiesta la riduzione del movimento. Margini minimi di 32px su desktop e 16px su iPad, larghezza massima 1440px e angoli di 20px (16px su iPad). Le proprietà di posizione e le conferme brevi restano compatte. Nessuna barra apparecchi occupa il fondo del modello.

Sotto 1200px le proprietà restano larghe 300px e alcuni testi dei comandi si nascondono. Sotto 900px la navigazione diventa orizzontale e il selettore del piano entra nella barra della vista. I menu 3D si dispongono su più righe quando necessario. Sotto 640px i comandi di disegno 2D scorrono; proprietà e percorso guidato seguono il canvas, alto almeno 340px. Il riepilogo rimane aderente al fondo durante lo scorrimento.

Questi adattamenti privilegiano la disponibilità dei comandi: su telefono non sono tutti visibili simultaneamente. Nessun tema scuro è implementato.

La pagina di accesso usa un contenitore largo al massimo 980px e alto almeno 600px, con colonne in rapporto 0.9/1.1: identità navy a sinistra, form bianco a destra. Sotto 740px diventa una colonna larga al massimo 480px; restano il marchio compatto e il form, mentre introduzione e nota della regione identità si nascondono. Sotto 380px il margine esterno scende a 12px e il form usa padding di 28px/20px. L’altezza resta libera per errori e cambio password.

La vista cliente riusa il modello 3D in una finestra separata, destinata alla TV collegata al PC. Il guscio occupa 100dvh: intestazione e piè di pagina bianchi, separatori sottili e modello flessibile sul fondo freddo. Logo, nome del progetto, stato live e comando “Schermo intero” occupano l’intestazione; piano e impianti restano nel piè di pagina, che va a capo. Sotto 1100px margini interni e distanza tra gli elementi si riducono; il nome del progetto può andare a capo.

## Elevation & Depth

Pannelli ordinari separati da bordi e variazioni tonali. Pulsanti primari e zoom mantengono la lieve ombra del sistema condiviso; menu, dialoghi e strumenti sovrapposti ricevono maggiore profondità. Le ombre esatte sono registrate nel sidecar.

**The Profondità Rule.** Riservare le ombre più ampie a elementi che coprono un altro livello di lavoro.

## Shapes

Controlli con angoli compatti, gruppi leggermente più morbidi, pannelli e dialoghi più arrotondati. I raggi principali sono nel frontmatter. Il viewer usa anche controlli interni a 4px; il pulsante di chiusura del pannello prodotti è circolare. Bordi sottili, generalmente di 1px, definiscono campi e separatori.

## Components

### Buttons

Azioni compatte, con variante primaria blu, secondaria bianca, tenue trasparente e selezione azzurra. Hover cambia fondo e contorno; pressione sposta il pulsante di 1px. Disabilitazione riduce l'opacità. I comandi solo icona mantengono un nome accessibile.

### Inputs / Fields

Campi bianchi con bordo più marcato. Il focus combina bordo blu e alone tenue; il focus da tastiera aggiunge un contorno di 2px, distanziato di 3px. Nella pagina di accesso i campi sono più alti, almeno 50px, con testo a 16px.

### Navigation

Rail blu profondo, testi azzurri e voce attiva su blu di percorso. Il ciano evidenzia l'icona attiva. Gli ambienti selezionati riprendono il medesimo stato. Su schermi piccoli le voci scorrono in orizzontale.

### Cards / Containers

Schede e contenitori bianchi. Le schede prodotto usano un contorno blu e un secondo contorno interno quando selezionate; fotografie e SVG restano contenuti nella loro area. Le scelte del tipo di impianto e i filtri del marchio hanno stato premuto visibile.

### Proprietà contestuali

Nome della selezione, misure e fabbisogno precedono le sezioni espandibili. Le tre misure principali restano affiancate. Le sezioni tecniche si aprono con controlli espliciti e conservano le informazioni secondarie.

### Pannello prodotti

Il catalogo bocchette presenta il pulsante “Configura canalizzazione”; il popup separa modelli e configurazione della bocchetta in due colonne su PC e iPad. La scelta macchina mostra i modelli compatibili con potenza e portata. Gli altri cataloghi usano lo stesso popup arrotondato e centrato. Contenuto interno scorrevole, intestazione separata e chiusura sempre disponibile.
La pianta principale è l’unica superficie di lavoro per tutti gli apparecchi. La toolbar contiene inserimento macchina canalizzata, radiatore, ventilconvettore, split, pompa di calore e bocchetta. Ogni nuova macchina crea il proprio impianto automaticamente. Non si aprono schermate di creazione impianto o viste operative separate; i popup configurano soltanto l’apparecchio. Collega assegna le bocchette all’impianto della macchina scelta. La selezione mantiene accessibili proprietà e dettagli tecnici; Annulla recupera le modifiche.

Nel canalizzato si usa il canvas principale con tutti gli apparecchi visibili. La barra principale usa icone da 38 px su desktop e 44 px sui dispositivi touch, con tooltip, etichette accessibili e stato attivo. Il clic su un apparecchio apre il popup. Sposta, Scollega, Elimina e Annulla restano nel menu contestuale. Disegno e misure sono raccolti in un menu della stessa schermata. Il pannello proprietà compare quando contiene una selezione o il percorso guidato attivo. “Collega” accetta macchina e bocchetta configurate in entrambi gli ordini; mostra selezione e anteprima del percorso interno. Escape annulla; lo strumento resta attivo per ulteriori associazioni. Il selettore del bilancio distingue ogni macchina anche quando più macchine servono lo stesso ambiente. Il bilancio mostra mandata e ripresa, capacità collegata e portata mancante. Le linee tratteggiate mostrano associazioni di portata, distinte dai canali tecnici. Gli elementi senza modello sono indicati «Da configurare», salvati nel progetto e visibili anche in 3D come ingombri provvisori. Le bocchette configurate possono restare indipendenti senza una macchina di destinazione; non ne consumano la portata. Salva e Annulla restano nel piè di pagina fisso del popup; Annulla scarta tutte le modifiche della configurazione. Plenum, canali, posa e accessori restano nei dettagli tecnici della selezione. I percorsi di configurazione da modulo sostituiti dal flusso canalizzato 2D sono rimossi. L’apertura dei dialoghi avviene al clic completato, evitando la selezione involontaria di un modello sul rilascio touch.

Le bocchette principali sono EDLS, EDFL ed EGA6 Push, con fotografie; “Tutti i modelli Ecoclima” espande il catalogo. I modelli incompatibili restano visibili ma disabilitati, con il motivo. Dopo la scelta resta la configurazione del singolo punto: feritoie minime per impostazione predefinita, portata per metro, metri mancanti arrotondati per eccesso, lunghezza e moduli con kit intermedi. Mandata e ripresa restano distinte; il limite di 37 dB(A) vale solo per la mandata. Le quote frontali mancanti richiedono misure dichiarate dall’operatore.

### Vista cliente

“Apri vista cliente” e “Schermo intero” riusano il pulsante tenue con icona e testo. La finestra mostra il modello aggiornato dal configuratore; rotazione, zoom e spostamento seguono la camera dell’operatore. Menu di modifica, cataloghi e proprietà non occupano il canvas. Lo stato live è testo accessibile nell’intestazione; in attesa del progetto compare un messaggio centrale, mentre lo scollegamento mantiene l’ultima vista ricevuta con indicazione esplicita. Il piè di pagina distingue piano e impianti e conserva la nota sulle finiture illustrative.

### Menu e wizard

I menu hanno nomi di attività e non restano aperti insieme nella stessa zona. Escape e clic esterno li chiudono; scegliere un apparecchio chiude il menu e apre il suo pannello. Sotto 640px i menu File, Modifica e Opzioni 2D sono ancorati al viewport, a 12px dai lati e 56px dal fondo, con scorrimento interno. Il wizard si avvia anche senza importazione, rende visibili le proprietà e riprende il passaggio già salvato.

Il wizard presenta cinque fasi: Planimetria, Misure, Stanze, Impianti e Verifica. I dettagli di riconoscimento, muri, aperture e plenum si aprono su richiesta; ogni fase ha una sola azione primaria blu. Il pannello bianco misura da 360 a 480px sopra 640px; su telefono segue il canvas a tutta larghezza. Titoli di 24px, testi di 14px e navigazione numerata distinguono istruzioni e azioni. Senza selezione, le proprietà non mostrano il pannello introduttivo. Gli undici identificativi salvati restano compatibili: ogni fase riprende e conferma i passaggi corrispondenti.
La fase Impianti mostra un elenco per nome, tipo e stanze. “Aggiungi impianto” apre
una sola configurazione e parte dalla singola stanza scelta. Tipo e apparecchi
restano distinti; il tipo non cambia dopo l’inserimento di apparecchi. La vista 3D
mostra tutti gli impianti e ne offre il riepilogo separato nel menu “Impianti”.

### Login

Il logo Staiano originale occupa un supporto bianco di 52px su desktop e 44px nella versione compatta. Il form desktop ha padding di 48px/56px; il titolo misura 28px, poi 26px sotto 740px e 24px sotto 380px. Campi e azione principale sono alti almeno 50px; le etichette precedono i campi e il focus resta visibile. Gli errori hanno fondo rosso tenue e ruolo di alert. Nel cambio password, Esci è un’azione secondaria. Inter e logo sono locali; il form non richiede JavaScript aggiuntivo.

## Do's and Don'ts

### Do:

- **Do** mantenere coerente la selezione tra ambiente, canvas e proprietà.
- **Do** usare Inter locale e numeri tabulari per le misure.
- **Do** conservare focus visibile, nomi dei comandi e significato degli esiti.
- **Do** verificare scorrimento dei comandi e accesso alle proprietà sui telefoni.
- **Do** rispettare la preferenza di movimento ridotto.

### Don't:

- **Don't** assegnare colori di errore o successo ad azioni neutre.
- **Don't** nascondere i comandi fuori dal viewport senza consentire lo scorrimento.
- **Don't** applicare ombre ampie a ogni pannello.
- **Don't** introdurre un tema scuro come variante già prevista dal sistema.

## Area di lavoro PC

Su PC con puntatore preciso (larghezza da 1100 px), gli strumenti della pianta principale sono in una toolbar verticale a sinistra. La testata compatta contiene Salva, Annulla e Ripristina con tooltip; 2D/3D e opzioni restano sopra il canvas. Il comando Pannello ambienti richiude la navigazione in una colonna di icone e restituisce spazio alla pianta. Le proprietà restano contestuali e richiudibili; la configurazione canalizzata resta nei popup sulla stessa pianta. Il layout tablet mantiene i controlli precedenti e sarà trattato separatamente.


## Feedback e dimensionamento macchina

Le notifiche di esito ed errore usano toast chiudibili, visibili per 8 secondi e accessibili anche sopra i popup. I conflitti di salvataggio restano persistenti con le azioni di recupero. Istruzioni operative e dati tecnici rimangono nel loro contesto. Il popup macchina elenca gli ambienti effettivamente considerati e il carico di ciascuno, con l’invito a collegare tutte le bocchette prima del dimensionamento. I tooltip dei comandi con scorciatoia mostrano il tasto tra parentesi.

Il comando Muovi (M) trascina direttamente gli oggetti, anche se ancora da configurare. La posizione si salva al rilascio; un clic sulla pianta non sposta l’oggetto selezionato.
