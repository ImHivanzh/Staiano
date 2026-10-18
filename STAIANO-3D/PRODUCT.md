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
da spostare sulla TV collegata. Mostra il modello live senza i controlli del configuratore.

## Capabilities and Constraints

Next.js 16, React, CSS condiviso Staiano e CSS specifico dell'applicativo. Editor 2D, viewer Three.js, importazione DWG/DXF/PDF/immagini, cataloghi locali, listino e PDF. Autenticazione interna con ruoli amministratore e operatore. Progetti in IndexedDB separati per utente e origine; esportazione `.hvacproj` per trasferimento e backup. Le finiture 3D sono illustrative. Il redesign conserva calcoli, cataloghi, autenticazione, dati e azioni esistenti.

I progetti condivisi passano all’archivio server con accesso assegnato agli utenti registrati, blocco esclusivo per scheda, controllo delle revisioni e registro delle modifiche. Gli ambienti del canalizzato vengono ricavati dalle bocchette collegate; non richiedono selezione preventiva. In 3D il clic apre la configurazione dell’apparecchio, Collega associa macchina e bocchetta e una parete selezionata permette di inserire una porta. I cataloghi radiatori e stufe espongono modelli e finiture a pulsanti con immagini ufficiali; il catalogo stufe è disponibile anche nella vista cliente.

## Brand Commitments

Nome e logo Staiano esistenti. Interfaccia in italiano. Colori del logo blu, ciano e verde. Il foglio condiviso `public/sistema.css` si distribuisce da un altro progetto: personalizzare qui solo i fogli dell'applicativo.

## Evidence on Hand

README.md, ARCHITECTURE.md, cataloghi e asset locali, fixture `.hvacproj`, test Playwright. Nessuna nuova affermazione commerciale richiesta.

## Product Principles

- Il modello e la planimetria ricevono la maggior parte dello spazio disponibile.
- Strumenti di disegno, navigazione, apparecchi e documenti hanno gruppi riconoscibili.
- Le proprietà restano contestuali alla selezione e richiudibili.
- Tastiera, stati di salvataggio, errori e controlli tecnici restano visibili e accessibili.
