# Dossier tecnico guidato

Il PDF conserva una pagina tecnica per ogni macchina canalizzata, il relativo plenum dedicato e i collegamenti alle singole bocchette. La vista isometrica e la vista dall'alto usano la stessa geometria del modello 3D e le dimensioni del plenum salvato. La tabella degli attacchi riporta i numeri originali, i codici delle bocchette, i centri relativi al raccordo della macchina, i diametri nominali e i collari.

Le quote degli ambienti e le lunghezze utili dei muri sono interne. Le coordinate di origine e fine dei muri identificano gli assi geometrici e non sono presentate come misure interne. La luce interna del raccordo macchina è riportata soltanto quando documentata: un interasse della flangia non diventa una luce interna. Diametri commerciali nominali, ingombri degli apparecchi e quote proposte di fabbricazione sono etichettati separatamente.

I ventilconvettori configurati compaiono in planimetria, nella scheda dell'ambiente e nella distinta. Potenze, condizioni operative e rumore provengono dal punto operativo della revisione salvata. Il comando originale M7 e la scheda elettronica sono riportati quando selezionati; un abbinamento non documentato resta da verificare. Le fonti dei ventilconvettori e dei comandi conservano URL, revisione, pagina e SHA-256. Una revisione sconosciuta non riceve i dati del catalogo corrente.

## Verifica riproducibile

```powershell
node node_modules/vitest/vitest.mjs run src/services/pdf/dossier.test.ts src/services/pdf/dossier-contract.test.ts
node node_modules/tsx/dist/cli.mjs scripts/verification/pdf-guided.ts
pdftoppm -r 100 -png output/pdf/staiano-guided-dossier.pdf tmp/pdfs/staiano-guided
```

Il campione usa due macchine indipendenti, due plenum posizionati, i percorsi dei canali e un ventilconvettore Innova con comando originale M7. Il test legge il PDF reale con PDF.js e verifica codici, titoli delle viste, misure interne e metadati. Le immagini renderizzate richiedono anche controllo visivo: la sola estrazione del testo non prova la leggibilità del disegno.

Le pompe di calore configurate riportano modello, revisione, condizioni di targa, COP/EER, ingombro e posizione dell'unità esterna, ambienti serviti e codici dei ventilconvettori collegati. I punti dei percorsi idronici salvati sono riprodotti in tabella. Il campione include una pompa Chaffoteaux documentata; la compatibilità delle temperature dell'acqua resta una verifica distinta dalla somma delle potenze di catalogo.

Su Windows, se Vitest incontra un errore `EPERM` nella cache temporanea, impostare `TEMP` e `TMP` su una cartella scrivibile del progetto. Non serve modificare il codice applicativo.
