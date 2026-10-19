# Pacchetti Windows da Codeberg

Il repository canonico è [AvocadoOra/Staiano-3D](https://codeberg.org/AvocadoOra/Staiano-3D); il progetto si trova in `STAIANO-3D/`. Le release si producono dalla copia di sviluppo con `compila.bat`: test, build, collaudo e caricamento di `StaianoHVAC.exe` nella release Codeberg `exe-<commit>`, poi registrazione sul Worker.

Richiede Node 24.14.0 su Windows x64, albero pulito, accesso Codeberg con Git Credential Manager oppure `CODEBERG_TOKEN` (`write:repository`), e `LICENSE_PUBLISH_TOKEN` locale corrispondente al segreto `PUBLISH_TOKEN` del Worker. Nessuna credenziale viene inclusa nell’EXE. Il template `windows-release.yml` resta un’alternativa CI non attivata; esegue i comandi in `source/STAIANO-3D` e richiede i due segreti. Non copiarlo nel repository senza configurare prima i segreti.

Il Worker accetta nuove release soltanto da `AvocadoOra/Staiano-3D` e dalla revisione corrente di `main`. Il repository è privato: il Worker usa il segreto CODEBERG_READ_TOKEN con accesso di sola lettura. I download Codeberg restano sul dominio codeberg.org; le credenziali non vengono distribuite ai client.

L’EXE include Node, asset e backend V8 bytecode; TS/TSX, mappe e credenziali sono esclusi. Il client verifica firma Ed25519, macchina, nonce, hash SHA-256, dimensione e sequenza prima di sostituire la versione. Ogni EXE controlla all’avvio l’ultima versione pubblicata e non parte se è obsoleto o se il controllo non riesce. Il server Next di sviluppo è escluso da questo vincolo.

## Installazione

Dalla cartella `STAIANO-3D`: `compila.bat installa` installa anche sulla postazione. Il server di sviluppo usa invece `compila.bat` senza `installa`, mantenendo Next sulla porta 3015. L’installer verifica prima l’EXE su 3016, conserva dati e documenti tecnici e consente il ripristino della precedente azione Windows.

I documenti tecnici locali non sono inclusi nel pacchetto: copiare `catalog-data/sources` o usare i comandi `catalog:sources:*`. Non sostituire documenti con SHA-256 diverso da quello registrato. Il programma segnala i documenti assenti.

L’EXE non ha un certificato commerciale Authenticode; Windows può mostrare SmartScreen. Le versioni precedenti restano disponibili e nessun dato viene cancellato automaticamente.
