# Realismo 3D e progettazione semplice

Obiettivo: rendere il visualizzatore realistico e comprensibile. Le richieste successive
aggiungono strumenti di catalogo direttamente nel 3D, immagini panoramiche nel PDF,
canalizzati autonomi e calcolo degli stacchi del plenum di mandata.

## Criteri di accettazione

- Muri posteriori a tutta altezza, sezione davanti alla camera, aperture misurate,
  pavimenti con texture PBR locali, materiali, ombre e occlusione ambientale.
- Radiatori tubolari/alluminio, split e terminali riconoscibili, mantenendo ingombri,
  rotazioni, quote, fonti e selezione 2D/3D. Dati mancanti restano espliciti.
- Casa interamente inquadrata, vista dall'alto, focus, isolamento, orbit e fullscreen;
  smartphone senza controlli sopra il modello. Nessun errore runtime o console.
- Comandi Radiatori, Climatizzatori e Bocchette nel 3D aprono un catalogo visuale.
  Scelta famiglia/modello, ambiente e posa verificata in pochi passaggi.
- Inspector contestuale con riepilogo breve, icone e dettagli richiusi; nessun dato
  tecnico eliminato. Configurazione semplice verificata attraverso un flusso nuovo utente.
- Render panoramici JPEG reali a 1600×900, salvabili e inseribili nel dossier PDF;
  generazione locale, annullamento e cleanup dei contesti GPU verificati.
- Più canalizzati nella stessa abitazione: nomi, stanze, macchine, portate, terminali
  e rimozione indipendenti. Aggiornare una zona non modifica le altre.
- Plenum di mandata calcolato per ciascuna macchina autonoma: quantità stacchi,
  portata e diametro nominale, criterio di velocità trasparente e ripresa separata.
  Le quote del corpo plenum e del raccordo macchina non sono inventate.

## Prove durante lo sviluppo

Screenshot prima/dopo: `output/verification/realistic-3d/`.
Fixture riproducibili: `tests/fixtures/realistic-*.hvacproj`.
Le prime cinque prove browser passano: selezione vera su tubazione Ardesia,
materiali, camera, sezioni, isolamento, fullscreen, smartphone e finestra quotata.
Il vecchio crash delle etichette Drei Html è corretto con etichette nel root React
dell'applicazione. Il piano opaco delle ombre è corretto con framebuffer trasparente.

Le prove finali devono coprire anche le nuove richieste di catalogo 3D, PDF con render,
impianti autonomi e plenum. I gate precedenti non provano automaticamente questi flussi.

## Materiali e limiti

## Richieste aggiunte dall'utente

- Portata massima in tutti i calcoli: helper `maximumAirflowOption`, selezione,
  riparto, ricalcolo e validazione. I default nominali dei documenti restano originali.
- Macchina manuale: marca, modello, m³/h massimi; potenze e quote opzionali,
  origine manuale esplicita e nessuna potenza inventata.
- Ecoclima completo: 127 famiglie, 1778 varianti, 6788 punti originali; foto locali.
  Punti incongruenti o con rumore assente esclusi dall'automatismo. Inventario
  delle 109 pagine ufficiali e limiti in `catalog-data/generated/ecoclima.inventory.json`.
- Metri totali e ripartizione per ambiente: `terminalDistribution`; criterio legato
  a metratura e altezza, senza mescolare macchine autonome. Moduli commerciali reali.
- Listino: 6718 prezzi e 873 specifiche accessori, revisione 15-2026. Bocchette,
  plenum isolati, ponti e continuità documentati; importi in centesimi e fonti originali.
  Prezzi mancanti e plenum macchina su misura restano espliciti, senza false cifre.
- Plenum macchina: raccordi dei 21 modelli originali, attacchi presi dalle schede
  dei plenum terminali e corpo quotato come proposta di progetto. Per macchine
  manuali, le quote dell'attacco sono inserite dall'operatore.
- Radiatori: 466 varianti, incluse nuove famiglie Cordivari, Zehnder e Lazzarini,
  fotografie ufficiali; 206 finiture, con corpo/valvola/detentore/copritubo separati.
  Le finiture cromate con rese diverse restano distinte dalle varianti verniciate.
- Password richiesta: login semplice, hash scrypt e sessione HMAC. Credenziali
  private escluse da Git e dal confezionamento Next. La password viene ricevuta
  con input nascosto in memoria; nessun file contenente il testo della password.

Le verifiche finali devono comprendere questi flussi e l'effettivo rilascio HTTPS.
Non confondere la compilazione con la prova completa del comportamento nel browser.

Sei mappe PBR Poly Haven CC0 originali a 1K, circa 2,19 MB; fonti, licenze e hash
in `public/materials3d/manifest.json`. Sono finiture illustrative, non specifiche
del pavimento installato. Le mesh ufficiali Cordivari con larghezza incongruente
restano in anteprima; le geometrie procedurali rispettano gli ingombri di catalogo.

Le finestre storiche senza quota davanzale non ricevono un falso foro in 3D;
l'operatore può impostare la quota nelle proprietà. I soffitti in sezione sono
riferimenti alla quota misurata, non controsoffitti aggiunti artificialmente.
