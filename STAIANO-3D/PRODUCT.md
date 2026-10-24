# Staiano HVAC

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Operatori di Termoidraulica Staiano che progettano impianti HVAC. Priorità confermata: progettazione quotidiana 2D/3D, più spazio per il modello e comandi chiari.
Il programma viene usato su PC, solitamente a 1920×1080, e su iPad. Le verifiche dell’interfaccia si concentrano su questi dispositivi; gli smartphone sono fuori dallo scope richiesto.

## Product Purpose

Costruire una planimetria con misure reali, definire ambienti e fabbisogno, configurare apparecchi e produrre un dossier preliminare.
Ogni macchina crea automaticamente un impianto indipendente al suo inserimento.
Non esistono un passaggio “Nuovo impianto” o una vista operativa separata: canalizzato,
radiatori, split e ventilconvettori si inseriscono sulla pianta principale. Il clic
sull’apparecchio apre solo la sua configurazione; tutti gli impianti restano visibili.
I progetti esistenti conservano dati e collegamenti. Le bocchette si associano alla
macchina scelta con Collega, anche quando provengono da un altro impianto.
EDLS, EDFL, EDSC-C mandata ed EGA6 sono le scelte principali delle bocchette, con fotografie.
Il catalogo completo si espande su richiesta; dopo la scelta del modello continua la configurazione guidata.
Il canalizzato si inserisce e si configura direttamente sulla planimetria principale, che conserva visibili tutti gli impianti. Non richiede una vista operativa separata. Gli altri apparecchi usano gli strumenti della stessa pianta. Nel canalizzato si piazzano macchina e punti bocchette, si associano con Collega, si configura la macchina e infine si scelgono modello, lunghezza e moduli delle bocchette. La toolbar principale è compatta e usa icone per selezione, disegno, macchina, bocchetta e collegamenti; i tooltip mostrano il nome e il colore distingue lo strumento attivo. Le azioni secondarie sono raccolte nel menu dell’elemento; disegno e misure restano accessibili sulla stessa pianta. Lo strumento “Collega” associa la bocchetta alla macchina con due clic e aggiorna il bilancio della macchina scelta. Più macchine nello stesso ambiente mantengono portate e collegamenti indipendenti. Gli elementi «Da configurare» vengono salvati subito nel progetto e restano esclusi da calcoli e computi. Macchine e bocchette si inseriscono senza scegliere un modello; la configurazione si salva dal popup. Escape annulla inserimento o collegamento. Le bozze bocchetta si associano con Collega; la configurazione diventa disponibile dopo quella della macchina collegata. I radiatori possono coprire quote del fabbisogno su punti separati. Gli impianti si possono eliminare e recuperare con Annulla.
Per la ripresa la scelta principale è EGA6 con chiusura Push a richiesta. Il limite
di 37 dB(A) vale soltanto per la mandata. La ripresa complessiva si confronta con
la portata totale della macchina; dimensioni e distribuzione sono scelte dall’operatore.
La vista cliente si apre in una finestra separata sullo stesso computer e browser,
da spostare sulla TV collegata. Mostra il modello live senza i controlli del configuratore; rotazione, zoom e spostamento seguono la camera dell’operatore.

## Capabilities and Constraints

Next.js 16, React, CSS condiviso Staiano e CSS specifico dell'applicativo. Editor 2D, viewer Three.js, importazione DWG/DXF/PDF/immagini, cataloghi locali, listino e PDF. Autenticazione interna con ruoli amministratore e operatore. Progetti in IndexedDB separati per utente e origine; esportazione `.hvacproj` per trasferimento e backup. Le finiture 3D sono illustrative. Il redesign conserva calcoli, cataloghi, autenticazione, dati e azioni esistenti.

L'importazione raster/PDF può ricostruire una planimetria 2D modificabile con muri, stanze e aperture. Il server usa Raster2Seq per la struttura delle stanze e il riconoscimento dell'immagine originale per allineare i muri. L'operatore conferma una quota reale; il programma calcola superfici e volumi con il motore geometrico esistente. Le aperture ricavate da un varco visibile mantengono indicazione di proposta da verificare e quote verticali preliminari. Scanner e dettagli tecnici si raccolgono quando la bozza è pronta, lasciando spazio all'anteprima. Non si genera una mesh 3D tramite AI.

Il riconoscitore avanzato è installato sul server Windows con Python 3.12 e checkpoint locale verificato; non invia disegni a servizi AI esterni. Il processo GPU/CPU si annulla alla chiusura della finestra e cancella i file temporanei. Il riconoscitore nel browser resta disponibile senza il runtime avanzato, con lettura nelle quattro orientazioni, gestione del contrasto e filtro dei caratteri isolati. Le proposte richiedono controllo sul documento originale; nessun modello garantisce tutte le geometrie di ogni planimetria.

I progetti condivisi passano all’archivio server con accesso assegnato agli utenti registrati, blocco esclusivo per scheda, controllo delle revisioni e registro delle modifiche. Gli ambienti del canalizzato vengono ricavati dalle bocchette collegate; non richiedono selezione preventiva. In 3D il clic apre la configurazione dell’apparecchio, Collega associa macchina e bocchetta e una parete selezionata permette di inserire una porta. I cataloghi radiatori e stufe espongono modelli e finiture a pulsanti con immagini ufficiali; il catalogo stufe è disponibile anche nella vista cliente.

Il disegno distingue Muro dritto (L) e Muro curvo (U). Per una curva si scelgono inizio, fine e un punto di passaggio, con anteprima prima della conferma. Escape annulla il disegno; Annulla rimuove la curva in una sola operazione. I tratti condividono un identificativo di curva per la selezione complessiva e conservano la compatibilità con salvataggio, modello 3D, PDF e SKP; la geometria è un’approssimazione a corde, non un arco analitico.

File > Scarica modello SKP esporta il piano attivo: sfondo importato calibrato, architettura e geometrie effettive di apparecchi, plenum e canali. Conserva i colori geometrici, senza texture PBR. Richiede SketchUp installato sul server Windows e il bridge locale compilato; non esporta tutti i piani insieme.

I dossier completo e sintetico generati dal browser includono sempre render 3D effettivi; se il render manca, l’esportazione si interrompe con un messaggio esplicito. Viewer ed esportazione condividono terreno, fondazioni, illuminazione naturale e finiture illustrative. Il PDF allinea logo originale a sinistra e QR a destra, centra misure e valori numerici, separa le righe con spazio e campiture leggere e identifica la macchina di ogni plenum con codice, marca e modello.

Il QR apre la guida pubblica https://staiano-dossier.ivanbuonocore7.workers.dev/ con il riepilogo del progetto al momento dell’esportazione. Ogni riepilogo usa una chiave AES-256-GCM e un nonce casuali; RSA-OAEP protegge la chiave AES e la chiave privata resta un segreto del Worker. Il QR contiene solo la busta cifrata, senza disegni o file progetto completi. Link assenti o non validi lasciano accessibile la guida generale; i dati del riepilogo non si aggiornano in tempo reale.

## Brand Commitments

Nome e logo Staiano esistenti. Interfaccia in italiano. Colori del logo blu, ciano e verde. Il foglio condiviso `public/sistema.css` si distribuisce da un altro progetto: personalizzare qui solo i fogli dell'applicativo.

La guida mostra il simbolo originale e il nome STAIANO. L’icona Windows `deploy/staiano.ico` deriva da `public/logo.svg`, in sette dimensioni da 16 a 256 px; non introduce asset generativi o una nuova identità.

## Evidence on Hand

README.md, ARCHITECTURE.md, cataloghi e asset locali, fixture `.hvacproj`, test Playwright. Nessuna nuova affermazione commerciale richiesta.

## Product Principles

- Il modello e la planimetria ricevono la maggior parte dello spazio disponibile.
- Strumenti di disegno, navigazione, apparecchi e documenti hanno gruppi riconoscibili.
- Le proprietà restano contestuali alla selezione e richiudibili.
- Tastiera, stati di salvataggio, errori e controlli tecnici restano visibili e accessibili.

## Flessibili fra plenum

La vista Canale mostra tubi corrugati dagli stacchi del plenum macchina agli stacchi del plenum bocchetta. I due plenum sono sempre corpi separati, creati con lo strumento Plenum e associati con Collega: senza i corpi non viene disegnato alcun plenum né un tubo verso la bocchetta. Le quote mancanti non vengono inventate. Materiale, stacco e forma appartengono al plenum, non alla bocchetta. Il plenum terminale e le connessioni rispettano montaggio, rotazione e lato dello stacco. La macchina e il proprio raccordo hanno lo stesso asse verticale, anche con controsoffitto.

I flessibili hanno rettilinei e archi circolari tangenti, con raggio preferito pari a due diametri e minimo geometrico pari a un diametro. I percorsi automatici cercano lo spazio per le curve mantenendo gli imbocchi assiali; non usano spline libere. I punti manuali restano salvati. Se non entra una curva o il tubo si sovrappone a se stesso, la mesh non viene inventata: appare “Percorso non realizzabile: sposta curve o plenum”; per i canali salvati compare anche un controllo del progetto. Le indicazioni del produttore del tubo e la verifica esecutiva restano necessarie.

Il controllo considera il diametro dichiarato del tubo e le superfici finite di
controsoffitti, fronti delle fasce e falde, usando la stessa geometria della vista
3D. Le giunzioni fra fasce adiacenti lasciano continuo il vuoto tecnico; quote
inferiori diverse conservano il gradino reale. Se esiste una curva alternativa
libera, il routing la preferisce mantenendo gli stacchi fermi. Un percorso manuale
che interferisce viene segnalato in rosso senza riscrivere i punti salvati.

## Cartongesso per muro e volume tecnico vuoto

Selezionare il muro e aprire Proprietà > Cartongesso e vuoto per i canali. Scegliere il lato stanza per una parete condivisa e inserire lo scostamento in centimetri: +30 crea il nuovo fronte 30 cm verso la stanza; -30 conserva il fronte già presente sulla pianta e dichiara 30 cm di intercapedine dietro. 0 rimuove la dichiarazione. Il riferimento del muro originale rimane salvato. Le superfici e i volumi netti tengono conto dei nuovi fronti interni, senza sottrarre due volte i pilastri sovrapposti.

Ripetere sulle pareti laterali: fronti e retro si uniscono agli angoli e il vuoto resta continuo. In 2D la fascia tecnica ha un riempimento leggero e un contorno distinto; in Vista Canale il fronte 3D è trasparente. La struttura è vuota, con due superfici e chiusure soltanto alle estremità libere; porte e finestre conservano i propri varchi. Le bocchette seguono il fronte e rispettano lo spazio residuo presso i risvolti.

Per un plenum inserito separatamente, Proprietà > Direzione stacchi reali distingue attacchi orizzontali e superiori, anche con montaggio a parete. L'orientamento indica il manufatto effettivo: non promette una variante di catalogo. Il numero e il diametro degli stacchi dichiarati alimentano i singoli tubi del plenum macchina. Raggi, ingombro nel vuoto e quota superiore restano controllati; una profondità insufficiente non viene aumentata automaticamente. Il programma propone percorsi, non certifica interferenze dell'impianto completo o supporti di posa.

## Corpi Ardesia da elementi originali

Per le 135 varianti Ardesia il corpo 3D usa il profilo di un elemento estratto
dagli OBJ Cordivari. Gli elementi si ripetono al passo pubblicato di 46 mm;
le testate mantengono la forma originale e cambia soltanto la lunghezza assiale
dei tubi. Interassi, ingombri e dati termici salvati non vengono riscritti.
Cinque asset locali, circa 418 kB complessivi, coprono le 2–6 colonne.

Questa è una ricostruzione del corpo: tappi, valvole e accessori restano
illustrativi. Le 18 mesh complete, che comprendono componenti terminali con
larghezza diversa dalla quota nominale con tappi, restano in verifica e in
anteprima. Dati storici incompatibili o file non disponibili mantengono la
ricostruzione dimensionale precedente. I dettagli tecnici riportano la fonte
della geometria e la nota di larghezza del catalogo.

## Quote di posa e vuoti tecnici distinti

I radiatori verificano tutto il proprio rettangolo sotto il soffitto finito,
le fasce e le falde. La quota iniziale di disegno resta 10 cm da terra. La posa
cerca una posizione libera adatta; sotto un colmo può usare l'altezza locale
superiore alla gronda. Anche la ricerca termica tiene conto del controsoffitto
centrale e dell'altezza di colmo, prima della verifica puntuale dell'ingombro.

Per i ventilconvettori, il corpo esposto resta sotto le superfici finite; quello
nascosto può occupare un vuoto dichiarato, senza attraversarne i pannelli.
Il vuoto della fascia e quello sopra il controsoffitto centrale sono distinti.
Gli spostamenti a soffitto conservano lo scostamento dal riferimento di posa
scelto; le quote calcolate restano modificabili senza imporre un passo di 1 cm.
Le proprietà mostrano gli intervalli geometrici ammessi, riferiti al centro per
la posa a parete e alla faccia inferiore per quella orizzontale.

Le pose salvate non vengono corrette automaticamente: se una modifica della
stanza le rende incompatibili, restano consultabili e vengono segnalate.

## Verifiche di progetto e catalogo

Le proprietà mostrano altezza finita, volume utile e vuoto tecnico del controsoffitto.
Il volume usa la quota finita anche senza tetto o fasce laterali. I metri dei
flessibili seguono la curva 3D; un percorso irrealizzabile resta da correggere e
non riceve una falsa lunghezza. Il routing cerca alternative libere prima di
conservare un percorso ostruito e rispetta il lato di ogni stacco manuale.
Durante la posa, cliccare un apparecchio già presente apre la configurazione
senza duplicarlo; lo spazio vuoto resta disponibile per altri inserimenti.

I nuovi sistemi split usano ingombri esterni pubblicati per tutti gli 83 codici
a catalogo, con fonte e pagina nelle proprietà e nelle schede tecniche. I progetti
storici mantengono le quote indicative e la richiesta di verifica prima della posa.
Il caricamento non aggiorna automaticamente dimensioni o revisione del catalogo.
Le unità VRV e le pompe di calore mantengono le quote pubblicate nei rispettivi
cataloghi. Ventola e griglia esterna sono dettagli illustrativi condivisi;
nessuna quota o prestazione viene dedotta dall'aspetto del 3D.

Il catalogo Innova AirLeaf 2026 completa portata e pressione sonora delle 25
varianti SL/SLS/SLI. Il solo punto selezionabile è quello massimo a 0 Pa, con
rumore misurato a 1 m: le condizioni restano visibili vicino alla fonte. I
progetti storici conservano i dati della loro revisione. Selezione, spostamento,
proprietà, vista 3D e controlli split/VRV usano la quota minima sopra l'intero
ingombro: controsoffitto piano, fasce ribassate e falde. Anche una fascia stretta
che attraversa il corpo senza toccarne centro o angoli limita la quota. La
sommità resta a 0,10 m dalla superficie più bassa: è una scelta iniziale di
disegno, non una distanza certificata dal produttore. Le posizioni salvate non
cambiano al caricamento; una posa divenuta impossibile viene segnalata e si
riposiziona solo con la riconfigurazione esplicita. Gli ingombri VRV partecipano
anche ai controlli di sovrapposizione con gli altri apparecchi.

Sul telefono la pianta resta visibile sotto una testata compatta. Gli strumenti
si scorrono lateralmente; i menu di disegno e azioni si aprono nello schermo,
con comandi da 44 px. Salva, Annulla e PDF restano nei menu File e Modifica.


## Schema e dimensionamento del plenum

Aprire la configurazione della macchina già collegata e la sezione «Schema e
dimensionamento plenum». Lo schema e la distinta usano quella macchina e i suoi
terminali; l'anteprima 3D si carica soltanto aprendo la sezione. Si possono
consultare stacchi numerati e diametri, ingrandire il disegno e dichiarare
l'attacco di ripresa per creare il secondo plenum. I comandi di modifica
rispettano blocchi e sola lettura. La scheda aeraulica dei ventilconvettori
espone lo stesso controllo; la loro posa segue la posizione dell'apparecchio.
Le figure sono schemi dimensionali da verificare prima della fabbricazione.

Nel dimensionamento radiatori il ΔT esprime la sovratemperatura acqua/ambiente
della resa di catalogo. L'esempio nominale 75/65/20 °C corrisponde a 50 K.


## Inserimento coerente dal 3D

Nel menu «Aggiungi apparecchio», radiatori, split, bocchette, macchine manuali,
ventilconvettori e pompe di calore usano lo stesso comando «Inserisci sulla pianta».
La posizione si sceglie nella planimetria principale. Le bozze restano salvate;
i collegamenti precedono la configurazione della macchina e dei suoi terminali.
Comandi M7, cataloghi e proprietà della PdC rimangono nelle schede dell'apparecchio.

Le ricostruzioni Ardesia Cordivari a 2–6 colonne usano tubi Ø25 mm dalle schede
originali. Le altre geometrie illustrative mantengono i propri criteri; le mesh
OEM discordanti restano consultabili e marcate da verificare.

## Coefficiente termico del progetto

La schermata iniziale e «Nuovo progetto» permettono di scegliere il coefficiente
in W/m³ prima del disegno, dell’importazione o del percorso guidato. Il valore
predefinito è 35 e resta tale per i progetti precedenti. Il valore scelto si salva
nel progetto e si modifica anche da File > Impostazioni progetto e piani.
Il fabbisogno usa il volume netto effettivo, comprese falde e ribassamenti.
Il ricalcolo conserva geometria, apparecchi ed esclusioni dalla climatizzazione;
controlli, dimensionamento e PDF usano i nuovi carichi. I file dello schema 8
richiedono una versione aggiornata sugli altri client.
