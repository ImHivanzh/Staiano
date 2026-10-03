# Stato per proseguire l'obiettivo

Obiettivo attivo: completare tutto il brief allegato. Non fermarsi alla base.
Creazione manuale e colori/logo forniti dall'utente sono requisiti prioritari.

## Verificato

44 unit test, 5 E2E sia dev sia produzione,strict,lint,build. Report VERIFICATION.md.
Next16.3.8,React19.3,Three/R3F,Zod,Zustand,IndexedDB,PlaywrightEdge.
Editor manuale,Snap,quote nette/asse,adjacency,split/merge,multipiano,undo/recovery.
154varianti radiatori reali;144 terminali Ecoclima, 490 punti, 12 quarantinati.

## Prossimo lavoro

1. Completare milestone 6: EADD/EGS, dimensioni reali/profondità terminali,
   persistenza della scelta e posizionamento. Poi collegare tutto a canalizzato.
2. Milestone7: cataloghi ufficiali macchine, motore distribuzione proporzionale,
   selezione macchina per marca e mandata/ripresa separate per stanza.
3. Milestone8: split e multisplit solo con dati combinazioni ufficiali.
4. Milestone9: dossierPDF e materiali; poi hardening10 e limiti del report.

## Fonti iniziali per canalizzato

- Daikin tabella ufficiale:
  https://www.daikin.it/it_it/cerca-prodotto/product.table.html/fba-a%289%29---rzasg-mv1.html
- Daikin2025:
  https://www.daikin.it/content/dam/DACI-Internet/Download/catalogo-generale-2025/202501%20Catalogo%20Residenziale%2020250429.pdf
- Mitsubishi PEAD-MJA2:
  https://climatizzazione.mitsubishielectric.it/sites/default/files/documents/import/scheda_tecnica_5027.pdf
- Gree: ricerca ufficiale ancora necessaria. Non importare dati senza provenienza.
- Attenzione: DaikinFBA-A semplice è indicato fuori produzione. Verificare
  lo stato dei modelli prima della selezione automatica; non confondere FBA-A9.

## Tooling

Shell sandbox si è guastata con `helper_unknown_error: setup refresh had errors`.
Le esecuzioni autorizzate con require_escalated hanno funzionato. Nessuna
reiezione dell'auto-review. CUA/IAB fallisce per lo stesso errore; UI verificata
con Playwright sull'app locale e screenshot locali. Edge installato, Chromium
bundled Playwright non installato: usare channelmsedge già configurato.

Python bundle:
`C:\Users\Daniele\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe`
conpdfplumber,Pillow. Installer npm usa cache locale.npm-cache (ignorata).
Serverdevsession94119; serverproduzionesession28841 (3016). Riavviare produzione
dopo nuove build; non dichiarare che un processo esistente serve il nuovo bundle.

## Invarianti da preservare

- Mai AI nel runtime, nessun login/APIesterna obbligatoria.
- Quote in metri, cataloghi mm, calcoli W senza rounding intermedio.
- Muri assi; stanze facce interne. `recomputeProject` materializza giunzioni.
- Worker importa codec puro. FactoryWorker inservices/import/project-file.ts:
  non reintrodurre ciclo format.ts-worker che blocca Turbopack.
- Snapshotcatalogo identificati dal contenuto; nessun modello sintetico.
- EDLSrev03:3feritoie30mm primoQ305, non315 della revisione precedente.
- Rumore `<20` o range resta esplicito; autoselezione usa upperbound≤37.
- Grafica comune inpublic/sistema.css copia immutata del design-system.
  Logo effettivo inpublic/logo.svg;paletteblu/ciano/verde e Inter locale.
- AGENTS.md generato daNext: leggere guide innode_modules/next/dist/docs
  per nuove modifiche al framework. Non cambiare altri gestionali oCaddy.

## Lavoro immediato ancora non registrato come prova

Ultime modifiche: blocco radiatori se scala non verificata; reportdiff confronta
prodotti normalizzati per evitare falsi positivi da ordine delle chiavi; quota
esatta non si accorcia per chiusura automatica. Eseguire test mirati e gates.

EVVMC/EVVMB già normalizzati: usare ecoclima-valves-extract.py per le celle PDF, poi importer Ecoclima. 45 righe originali; la tabella condivisa 150/160 è applicata a entrambi i diametri. Foto locali e relative fonti in public/catalog.

Stato aggiornato: server produzione 28841 fermato dopo verifica; resta attivo server sviluppo 94119 sulla porta 3015. Ultimi gates: 44 unit test, 5 E2E, lint, formatter e build passati. Riprendere dal lavoro rimanente, senza rifare la base.
