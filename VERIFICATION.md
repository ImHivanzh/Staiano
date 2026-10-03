# Verifica incremento — 3 ottobre 2026

## Prove eseguite

- `npm test`: 44 test su geometria netta, termico, connessioni, split/merge,
  multipiano, schema/migrazione, IndexedDB, recovery, undo/redo, radiatori e aria.
- `npm run typecheck`: TypeScript strict senza errori.
- `npm run lint`: ESLint senza errori o warning all'ultima verifica completa.
- `npm run build`: build produzione Next.js 16.3.8 riuscita.
- `npm run test:e2e`: 5 flussi reali in Edge, tutti passati anche su produzione
  `http://127.0.0.1:3016`, dopo rimozione del ciclo fra worker e codec.
- Screenshot ispezionati: editor desktop1440 e tablet800, modello3D estruso,
  gallery con foto ufficiali locali. Corrette leggibilità quote, icone e frame3D.

## Flussi browser coperti

1. Gallery Ecoclima: portata480m³/h,2punti, scelta indipendente EDLS/EBLF,
   dati di lunghezza teorica/commerciale e fotografie caricate localmente.
2. Radiatori: GlobalVIP,2apparecchi, dimensionamento, posizione, salvataggio,
   reload e controlli distinti su prodotto, resa, potenza, ΔT e ingombro.
3. Manuale: rettangolo netto5×4m, h2,70m,1890W; h3m produce2100W;
   quota6×4m, undo/redo, import/export.hvacproj e3D senza errori JavaScript.
4. File con versione futura: errore utile, progetto corrente conservato;
   recupero autosave precedente e duplicazione da archivio.
5. Editor800px: contorno libero pentagonale chiuso con cinque pareti;
   nessun overflow orizzontale della pagina.

## Fonti e fixture reali

- Cordivari:135varianti Ardesia,27altezze×5colonne, revisioni2025 collegate
  dal sito ufficiale. Tabelle per elemento, profondità66/107/148/189/230mm,
  passo46mm e tappi+24mm verificati sui disegni originali.
- Global:5VIP,7Oscar,7OscarTondo. Schede complete, listino giugno2026,
  certificati ufficiali conservati; Km/n e dimensioni originali.
- Ecoclima:5 famiglie normalizzate EDLS, EBLF, EGQ, ETA, EVVMC/EVVMB;144 varianti,
  490 operating point.12punti discordanti restano originali e sono esclusi
  dall'autoselezione. Limiti/intervalli acustici non diventano valori inventati.
- URL,hashSHA256,revisioni e date in manifest,discovery e sourceMetadata.
  Fonti non disponibili non vengono sostituite con dati da rivenditori.

## Limitazioni da chiudere prima del completamento generale

- Cataloghi e workflow canalizzato/split Daikin,MitsubishiElectric,Gree
  ancora da implementare. Nessuna compatibilità multisplit inventata.
- Terminali: calcolatore reale nel catalogo; assegnazione automatica da
  macchina, persistenza delle scelte, posizionamento2D/3D ancora mancanti.
- EVVMC/EVVMB: normalizzati sei diametri e celle raggruppate, incluse aperture negative del cono.
  EADD/EGS: pagine originali individuate, prestazioni sufficienti non acquisite.
- RumoreEDLS riferito a1m: rumore complessivo per altre lunghezze o più unità
  rimane da verificare. EDLS ripresa non usa impropriamente dati di mandata.
- Radiatori: combinazioni con numero elementi diverso, ma stessa variante
  per stanza. Ricerca tra varianti miste ancora da estendere.
- Vincoli valvole/accessori oltre ingombro con tappi, collisioni tra apparecchi
  e aggiornamento posizione dopo ogni trasformazione geometrica da completare.
- Import rasterPNG/JPEG/WebP e calibrazione presenti; PDF/DXF/DWG ancora mancanti.
  DWG richiede scelta esplicita di parser/licenza o conversione esterna.
- Worker importprogetto presente; benchmark100muri/50stanze/100apparecchi,
  test su storagequota, testmobile, focusdialoghi e hardening ancora mancanti.
- Dossier PDF, distinta materiali e screenshot esportabile ancora mancanti.

## Stato operativo

Server sviluppo attivo su 3015. Build produzione verificata su 3016 e poi fermata. L'obiettivo resta
attivo: questo report prova l'incremento, non il completamento dell'intero brief.
