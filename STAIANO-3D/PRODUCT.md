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
Il canalizzato si inserisce e si configura direttamente sulla planimetria principale, che conserva visibili tutti gli impianti. Non richiede una vista operativa separata. Gli altri apparecchi usano gli strumenti della stessa pianta. Nel canalizzato si piazza la macchina, si clicca per configurarla, si piazzano i punti bocchette e si cliccano per scegliere modello, lunghezza e moduli. La toolbar principale è compatta e usa icone per selezione, disegno, macchina, bocchetta e collegamenti; i tooltip mostrano il nome e il colore distingue lo strumento attivo. Le azioni secondarie sono raccolte nel menu dell’elemento; disegno e misure restano accessibili sulla stessa pianta. Lo strumento “Collega” associa la bocchetta alla macchina con due clic e aggiorna il bilancio della macchina scelta. Più macchine nello stesso ambiente mantengono portate e collegamenti indipendenti. Gli elementi «Da configurare» vengono salvati subito nel progetto e restano esclusi da calcoli e computi. Macchine e bocchette si inseriscono senza scegliere un modello; la configurazione si salva dal popup. Escape annulla inserimento o collegamento. Le bocchette possono essere configurate prima di qualsiasi macchina e si associano soltanto con Collega. I radiatori possono coprire quote del fabbisogno su punti separati. Gli impianti si possono eliminare e recuperare con Annulla.
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

La vista Canale mostra tubi corrugati dagli stacchi del plenum macchina agli stacchi del plenum bocchetta. Se non sono stati inseriti corpi separati, mostra le geometrie proposte con quote e stacchi disponibili nel catalogo; non salva nuovi oggetti nel progetto. Le quote mancanti non vengono inventate. Il plenum terminale e le connessioni rispettano montaggio, rotazione e lato dello stacco. La macchina e il proprio raccordo hanno lo stesso asse verticale, anche con controsoffitto.

I flessibili hanno rettilinei e archi circolari tangenti, con raggio preferito pari a due diametri e minimo geometrico pari a un diametro. I percorsi automatici cercano lo spazio per le curve mantenendo gli imbocchi assiali; non usano spline libere. I punti manuali restano salvati. Se non entra una curva o il tubo si sovrappone a se stesso, la mesh non viene inventata: appare “Percorso non realizzabile: sposta curve o plenum”; per i canali salvati compare anche un controllo del progetto. Le indicazioni del produttore del tubo e la verifica esecutiva restano necessarie.
