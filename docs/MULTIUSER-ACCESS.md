# Accesso multiutente

Prima del login, il configuratore richiede di scegliere un utente attivo dal menu a tendina e inserire la password personale. Gli account iniziali sono `samuele`, `gionathan`, `marco` (operatori) e Ivan (amministratore, identificativo interno `admin`). Gli operatori hanno accesso al configuratore; il ruolo amministratore identifica chi gestisce gli account sul server. I progetti sono salvati in IndexedDB in un archivio locale distinto per nome utente. L'account admin conserva l'archivio precedente, così i progetti esistenti restano accessibili. Gli archivi appartengono al browser e al dispositivo; non sono un archivio condiviso sul server.

Eseguire `node scripts/manage-accounts.mjs --bootstrap` nella cartella del progetto. La configurazione privata è `.cache/app-auth.json`; le password casuali individuali vengono salvate in `.cache/initial-user-credentials.json` con permessi limitati, senza stamparle nella console. Consegnare a ciascuno solo la propria password e rimuovere il file delle credenziali dopo la consegna. Le nuove password devono essere cambiate al primo accesso. Un admin già configurato conserva la sua password. L'operazione è ripetibile e non reimposta utenti esistenti.

Sul server, `AUTH_FILE` può indicare un percorso privato alternativo. Il file iniziale delle credenziali si trova nella stessa cartella. Non copiare questi file nel repository o nella cartella pubblica. Nessun file di produzione viene modificato automaticamente dal progetto.

Gestione amministrativa dalla shell del server:

Dal profilo admin è disponibile la voce **Gestione utenti** nella navigazione. L'amministratore può creare un operatore con nome utente, nome visualizzato e password iniziale, oppure impostare una nuova password per un altro utente. Il nuovo account compare nel menu di accesso; creazione e reset richiedono un cambio password personale al successivo login. Il reset revoca le sole sessioni dell'utente interessato. La password dell'admin si cambia tramite il link personale, indicando la password attuale.

`GET/POST /api/admin/users` verifica sul server ruolo admin, sessione attiva e origine delle scritture. Le risposte contengono soltanto dati pubblici degli account. Le password sono salvate come hash scrypt con sale individuale, con la stessa sostituzione atomica e gli stessi permessi privati del cambio password personale; nessuna nuova password viene conservata in chiaro. Il limite è di 100 utenti. Le scritture dei due endpoint condividono la coda del processo, anche durante il ricaricamento dei moduli. Una configurazione con più processi che scrivono lo stesso `AUTH_FILE` richiede un archivio transazionale; la console va utilizzata senza scritture simultanee dall'app.

- `node scripts/manage-accounts.mjs --reset samuele`: nuova password temporanea e revoca immediata delle sessioni dell'utente.
- `node scripts/manage-accounts.mjs --disable marco`: disabilitazione e revoca delle sessioni.
- `node scripts/manage-accounts.mjs --enable marco`: riabilitazione; le vecchie sessioni restano revocate.
- `node scripts/configure-access.mjs --rotate-session-only`: revoca tutte le sessioni, mantenendo password e utenti.
- `node scripts/configure-access.mjs --stdin --rotate`: cambia la password admin tramite input nascosto, preserva gli operatori e revoca tutte le sessioni.

Non è possibile disabilitare l'ultimo amministratore. Alla migrazione dal login con password unica, le sessioni precedenti diventano invalide e occorre accedere nuovamente come `admin` con la stessa password.

`GET /api/auth/session` restituisce solo identità, nome visualizzato, ruolo e stato cambio password, mai hash o segreti. Il cambio personale avviene da `/accedi?password=change` e richiede la password attuale. Cookie firmati con scadenza di 8 ore, `HttpOnly`, `SameSite=Strict`, `Secure` su HTTPS, controllo origine e limite tentativi restano applicati.

Gli archivi sono separati per account nel browser in uso. I ruoli non introducono un archivio condiviso sul server. Per un archivio condiviso fra TV e altri dispositivi servirà una successiva integrazione server.
