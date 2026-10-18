---
version: 1
slug: "license-server-public-index-html"
primary_target: "license-server/public/index.html"
related_targets: ["license-server/public/admin.css", "license-server/public/admin.js", "tests/license-admin.spec.ts"]
---

# Licenses · pannello amministrativo

Modalità: Operate. Redesign richiesto dall'utente; tema scuro e tecnico confermato.
Priorità: licenze, software, clienti e postazioni leggibili insieme. Sviluppo in codice.

THESIS: Registro operativo. Una riga collega cliente, software, occupazione e stato;
i dettagli delle postazioni si espandono nel contesto della licenza.

OWN-WORLD: Fondo navy quasi nero, rail leggermente più chiaro, superfici slate,
testi freddi ad alto contrasto, azzurro per selezione e azione primaria. Un solo
sans di sistema per i comandi; cifre tabulari e monospace limitato agli identificativi.

STORY: Accesso con passkey; ricerca o filtro; lettura della licenza; apertura delle
postazioni; modifica o azione esplicita. La chiave nuova resta visibile fino alla
conferma di salvataggio, anche se il refresh successivo fallisce.

FIRST VIEWPORT: Header con identità e sessione. Rail desktop di 228 px; area di
lavoro con titolo, unica azione Crea licenza, ricerca e filtri, elenco compatto.
Su tablet le righe dispongono le azioni sotto i dati. Su telefono la navigazione
diventa orizzontale e ogni record usa due colonne senza perdere etichette o azioni.

FORM: seed:cf58d8992abe3e45, candidato 5 della derivazione. La palette scura è un
vincolo esplicito dell'utente e traduce la disciplina editoriale del registro.
Le alternative fotografiche, tipografiche bitmap, aeroportuali, a contenuto singolo
e di notazione sono scartate per leggibilità e confronto tra più licenze. Restano
la disciplina del contrasto, gli allineamenti, il ritmo e la chiarezza degli stati.

FINISH: Verifica indipendente su desktop, tablet e telefono; documentazione del
sistema effettivamente costruito in license-server/DESIGN.md e nel suo sidecar.

Scope: soltanto il frontend amministrativo e le sue prestazioni. Il codice backend
locale contiene un controllo versione EXE ancora da distribuire; il deploy del
redesign deve preservare il backend attualmente pubblicato e la sua configurazione.
