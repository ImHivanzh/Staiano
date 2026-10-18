# Importazione DWG locale

Il wizard importa DWG con ACadSharp3.8.0 (MIT), compilato in un processo .NET
separato. Il parser legge il binario reale e produce DXF ASCII UTF-8, poi il
workerDXF gestisce layer, assi, unità, curve e calibrazione. Nome, dimensione e
formato originali restano nel progetto. Entità non supportate producono avvisi;
non viene dichiarata una lettura universale di qualsiasi disegno.

## Runtime e licenze

.NET8o successivo è richiesto solo sul server locale per DWG. DLL e notice MIT
sono distribuiti in native/runtime; native/runtime-manifest.json registra SHA256,
commit sorgente e versione NuGet. Programma e package lock sono in native/DwgBridge.
Per ricompilare: npm run dwg:build (SDK.NET8già presente sul PC di verifica).
Il build usa restorelocked e cache nel progetto, telemetryoff e nessun certificato
HTTPS ASP.NET richiesto. La routine console non espone servizi né esegue scriptCAD.

Fonti primarie:

- https://github.com/DomCR/ACadSharp
- https://www.nuget.org/packages/ACadSharp/3.8.0
- native/notices/ACadSharp-MIT.txt (licenza del commit NuGet esatto)

ODA resta un provider opzionale disattivato per uso commerciale: il relativo
flag non è stato abilitato. Nessuna licenza ODA è necessaria al parser MIT.
GNU LibreDWG è stato studiato, non installato o integrato. Nessuna libreria GPL
nel runtime scelto. Eventuale selezione amministrativa: DWG_IMPORT_ENGINE=auto,
acadsharp,oda,disabled. Solo oda richiede ODA_COMMERCIAL_USE_CONFIRMED=1 e licenza
valida; la presenza dell’installazione ODA non prova l’autorizzazione.

## Sicurezza e limiti

Endpoint /api/import/dwg su hostloopback o hvac.internal.staianopoint.com;
origine coincidente con l’host reale del proxy Caddy, host esterni rifiutati.
Inputbinario massimo32MB, firma/CRC, timeoutlettura30s e jobparser30s, un job
alla volta. Processo .NET con heap512MB, stdoutignorato, nessuna shell e argomenti
fissi. Eseguibile/configurazione scelti dall’amministratore, non dai file caricati.
Outputstream32MB, geometrie50000, warning100×300caratteri, directoryjob privata
con pulizia limitata al percorso creato. Nessun XREF remoto o contenuto eseguito.
Il parser registra errori operativi senza stacktrace nell’interfaccia.

Versioni dichiarate dal progetto: R14/2000/2004/2007/2010/2013/2018. Disegni
più vecchi, proxy proprietari o geometrie fuori dal sottoinsieme2D richiedono
verifica manuale/esportazioneDXF dal CAD. Le curve sono discretizzate con avviso.

## Prove reali

Fixturetests/fixtures/rectangular.dwg: binarioAC1032,11480byte, quattro linee
MURI in metri. Parser nativo → DXF → wizard → stanza netta15,96m² → autosave/reload,
verificati dal browser sul dominioHTTPS senza bypassTLS. Testserver:origine,
MIME/size/firma, limite licenzaODA e geometria/persistenza. I test nativi vengono
esplicitamente saltati se manca il runtime, non contati come passaggi falsi.
Il DWGtroncato viene rifiutato e preserva il progetto. Verifica grafica e scala
restano responsabilità dell’operatore nel wizard.
