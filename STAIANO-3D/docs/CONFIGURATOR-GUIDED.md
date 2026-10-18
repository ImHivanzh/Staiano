# Configuratore guidato: analisi e piano

Analisi del 7 ottobre 2026, prima delle modifiche applicative.

## Architettura rilevata

Next.js 16, React 19, TypeScript strict. Le sole API server riguardano accesso e
conversione DWG tramite ACadSharp. Calcoli, cataloghi, import PDF/DXF/raster,
editor e dossier lavorano localmente. I cataloghi versionati provengono da
script di acquisizione distinti dal runtime; i dati mancanti restano espliciti.

`schemas/project.ts` definisce il progetto. `domain/project.ts` riconcilia il
grafo dei muri con i contorni interni delle stanze, preservando i contorni aperti.
`stores/project-store.ts` centralizza comandi, selezione, undo/redo. Repository
IndexedDB e codec `.hvacproj` sono in `services/project`; autosave serializzato.
SVG (`editor2d/Editor2D.tsx`) e R3F (`viewer3d/DeviceMeshes.tsx`) leggono gli stessi
oggetti. Nessuna geometria persistita separatamente per i due renderer.

`services/import` estrae segmenti CAD/PDF e rasterizza immagini/PDF. Il wizard
esistente richiede scala e selezione esplicite; raster esclusivamente sfondo.
Le stanze hanno area e volume netti, carico convenzionale volume × 35 W/m³.
Canalizzato, split, radiatori e terminali hanno motori puri e revisioni catalogo.
Il plenum ha un calcolo di connessioni e una geometria su misura documentata,
ma l'anteprima è separata dagli oggetti persistiti. `services/pdf/render.ts`
compone dossier vettoriale e immagini del modello tramite `render3d/export.tsx`.

## Problemi e lavoro locale preesistente

Sono già presenti modifiche locali additive allo schema v3, alla migrazione,
alle quote e ai metri lineari; vengono conservate e completate. I nuovi campi
non sono ancora collegati a editor, wizard, validazione e PDF. Il 2D quota gli
assi, il 3D seleziona ma non trascina. L'applicazione di una soluzione terminali
sostituisce tutte le bocchette della funzione nella stanza. Il refresh macchina
può cambiare modello senza una nuova scelta dell'operatore. Plenum persistiti
non sono ancora gestiti nelle selezioni o nella riconciliazione.

## Piano

1. Completare schema v3 e invarianti, migrare v0/v1/v2 senza perdere dati.
2. Analisi deterministica locale delle geometrie con candidati, affidabilità e
   limiti visibili; geometria realmente importabile, scala sempre confermata.
3. Percorso guidato persistente con ritorno agli step e strumenti manuali.
4. Requisito lineare separato da suggerimento e pezzi fisici. Creazione esplicita
   con lunghezza scelta, più pezzi/stanza, nessuna sostituzione implicita.
5. Comandi condivisi di modifica, snap, blocchi, selezione e plenum reale.
6. Quote interne coerenti, verifiche, dossier con bilancio e vista tecnica 3D.
7. Prove dominio, migrazione, persistenza, browser e impaginazione PDF.

Il riconoscimento raster euristico non può certificare ogni scansione: muri
obliqui, testo e simboli ambigui richiedono verifica manuale. Nessuna confidence
viene presentata come probabilità scientificamente calibrata. Nessun dato
tecnico OEM, rumore complessivo o perdita di carico viene inventato.
