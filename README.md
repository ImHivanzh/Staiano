# Staiano HVAC

Configuratore HVAC locale per Termoidraulica Staiano. Node.js >=20.9.

```powershell
npm ci
npm run dev
```

Aprire http://127.0.0.1:3015. Per avvio produzione: `npm run build`, poi `npm start`.
`avvia.bat` avvia il server locale senza download quando le dipendenze sono installate.

```powershell
npm run typecheck
npm run lint
npm test
npm run test:e2e
```

Creare progetto, scegliere disegno manuale, inserire stanza con misure nette o
chiudere un contorno di muri. Altezza suggerita esplicita: 2,70 m, modificabile.
I progetti sono nel browser (IndexedDB): esportare `.hvacproj` per il backup
portabile. Cancellare i dati del browser cancella l'archivio locale.

Architettura e limiti in ARCHITECTURE.md; stato milestone in ROADMAP.md.
