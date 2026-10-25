# Esportazione SketchUp

Il comando File → Scarica modello SKP esporta il piano attivo: sfondo importato nella scala calibrata, muri completi e aperture, apparecchi, plenum e canali della stessa scena 3D. Non esporta terreno illustrativo, etichette HTML, animazioni o comandi dell’editor. Geometrie triangolate e colori di base; texture PBR ed effetti del renderer non sono trasferiti.

Richiede Windows x64, il runtime .NET già usato dal lettore DWG e SketchUp installato sul PC del server. La rilevazione cerca SketchUp nelle cartelle standard; SKETCHUP_API_DIR permette un percorso amministrativo esplicito. L’app non ridistribuisce SketchUpAPI.dll o altre librerie del produttore. Il formato SKP salvato corrisponde alla versione dell’API installata.

Compilazione: deploy/build-dwg.ps1 compila anche SketchUpBridge senza pacchetti NuGet aggiuntivi. I binari generati in native/runtime sono ignorati da Git e vengono inclusi dal pacchetto EXE. Il bridge usa SUGeometryInput e SUEntitiesFill per unire i vertici, salva il modello e lo riapre per verificare gruppi e immagini. Imposta unità metriche e una camera che inquadra il modello.

Ogni muro viene esportato come un solo gruppo SketchUp, con i materiali assegnati alle facce. Ogni apparecchio (ventilconvettore, bocchetta, unità interna/esterna, radiatore, plenum o pilastro) viene esportato come un gruppo spostabile; le parti con materiali diversi restano sottogruppi interni.

Il browser cattura le geometrie effettive, incluse istanze e materiali multipli, senza modificare il progetto. Il server valida coordinate, limiti di complessità, corpo della richiesta e immagine PNG. La conversione avviene in un processo locale con limite di tempo e file temporanei eliminati al termine. Nessun dato viene inviato a servizi esterni.
