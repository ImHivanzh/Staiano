# Build precompilate dopo i push Codeberg

> **Percorso attuale.** Le release si producono da questa postazione con
> `compila.bat` (`deploy/build-release.ps1`): compila, collauda, carica il
> pacchetto nella release Codeberg e lo registra sul Worker. Il workflow qui
> sotto resta un'alternativa automatica, non utilizzata: richiede un repository
> GitHub privato dedicato e i due segreti CI.

Il PC cliente esegue soltanto `StaianoHVAC.exe`: non usa Git, npm, compilatori
o sorgenti del progetto. Il pacchetto include Node 24.14.0, asset di produzione
e backend V8 bytecode. Le mappe di debug e i file TS/TSX/Python originali sono
esclusi e verificati dalla build. Il JavaScript inviato al browser è inevitabilmente
ispezionabile. Il bytecode ostacola l'analisi, non impedisce reverse engineering.

## Macchina di build

Non serve un server Windows proprio. Copiare `windows-release.yml` in
`.github/workflows/windows-release.yml` di un repository GitHub **privato e dedicato**.
Il workflow controlla Codeberg ogni 5 minuti su un runner Linux temporaneo e
avvia un runner Windows temporaneo soltanto se cambia `main`. Rispetta le quote
del piano GitHub Actions; non abilitare spese aggiuntive senza un limite approvato.

Segreti CI richiesti:

- `CODEBERG_TOKEN`: token `write:repository` limitato a `AvocadoOra/Staiano-3D`, per
  scaricare il checkout privato e creare release/allegati. Nessun permesso admin.
- `LICENSE_PUBLISH_TOKEN`: valore casuale dedicato, uguale al segreto `PUBLISH_TOKEN`
  del Worker. Consente solo registrazione e lettura dello stato dei pacchetti;
  non concede gestione licenze né accesso alla chiave privata di firma.

Il Worker richiede inoltre `CODEBERG_READ_TOKEN`, token `read:repository` limitato
allo stesso repository. Non distribuirlo ai client. Il download viene mediato
da Cloudflare dopo il controllo online di licenza e postazione.

Il workflow verifica test e revisione esatta, produce l'EXE e lo pubblica in una
release immutabile Codeberg. `/publish` accetta solo la revisione corrente di
`main`. Il Worker firma un'autorizzazione di 5 minuti legata a macchina e nonce.
L'updater verifica firma, hash SHA-256, dimensione, prodotto, nonce e sequenza;
ricontrolla la licenza prima di sostituire il processo. Non accetta URL arbitrari.

Le credenziali disponibili tramite Git non possono necessariamente creare nuovi
token Codeberg: l'API richiede un accesso account idoneo. Quando questo manca,
creare i token dall'interfaccia Codeberg e inserirli direttamente nei secret
store, senza inviarli in chat o salvarli nel repository.

## Installazione locale

```powershell
$env:STAIANO_BUILD_DIR = '.next' # scegliere la directory non attiva
npm run exe:build
npm run exe:install           # sessione elevata
```

L'installer prova prima l'EXE su 3016, copia dati e documenti tecnici in
`C:\local-software\StaianoHVAC\application\data`, conserva l'azione Windows precedente,
poi modifica l'attività esistente `Staiano HVAC`. Crea `Staiano HVAC Update`
ogni 5 minuti. La cartella è limitata a utente, amministratori e SYSTEM.
Node è incorporato; lettore DWG e scanner mantengono le dipendenze preesistenti
.NET e Python 3.14/Pillow/driver Pantum. I PDF tecnici locali sono dati separati,
conservati durante gli aggiornamenti; non provengono dal checkout privato.

`active.json` contiene il pacchetto in uso; `data/.cache/production-server.json`
registra PID, revisione, build ed EXE. L'avvio deve rispondere HTTP 200 con
`X-Staiano-Build` corretto. Un avvio fallito ripristina l'azione precedente.
L'updater torna all'EXE precedente quando il nuovo non risponde.

## Limiti verificabili

Il canale aggiornamenti resta **non operativo** finché repository CI e segreti
non sono configurati e almeno un pacchetto è stato pubblicato e collaudato.
La firma del protocollo aggiornamenti è Ed25519; l'EXE non dispone ancora di
certificato commerciale Authenticode, quindi Windows può mostrare SmartScreen.
Un amministratore locale o il compromesso dell'account di pubblicazione possono
aggirare protezioni client: non esiste un eseguibile indecifrabile o inviolabile.

Se un updater viene terminato forzatamente, controllare che non sia più attivo
prima di rimuovere `data/.cache/update.lock`. Le versioni precedenti restano
disponibili: nessuna cancellazione automatica dei dati o dei sorgenti.
