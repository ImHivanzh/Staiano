---
version: 1
slug: "src-app-accedi-route-ts"
primary_target: "src/app/accedi/route.ts"
related_targets: ["tests/access.spec.ts"]
---

# Accesso Staiano HVAC

Modalità: Operate. Richiesta: rifare anche il login, mantenendo la chiarezza e l’identità dell’applicativo. Mondo esistente: Atlante tecnico, Inter locale, navy e blu Staiano. Nessun cambio di identità o comp approvata richiesto.

## Direction contract

THESIS: Il form è l’unica azione del login; il marchio identifica subito il configuratore.

OWN-WORLD: Navy #183249 per la regione identità, blu #365aa8 per Accedi, bianco per il form e fondo #edf2f6. Logo Staiano originale e Inter locale. Superfici piatte con un’ombra di contenitore.

STORY: L’operatore riconosce Staiano HVAC, sceglie l’utente, inserisce la password e accede. Errori e cambio password mantengono messaggi e vincoli esistenti.

FIRST VIEWPORT: Su desktop un contenitore largo al massimo 980px, identità a sinistra e form a destra. Sotto 740px solo marchio compatto sopra al form. Campi e CTA di almeno 50px, testo degli input 16px, lettura e tabulazione lineari. Altezza libera e scorrimento verticale negli stati lunghi.

FORM: Refinement nel mondo già scelto, seed storico 6b4c28d4; nessun nuovo roll. Build code-led. Login, errori e cambio password sono schermate native server-side, senza JavaScript aggiuntivo.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Preservation

Conservare autenticazione, sessioni, ruoli, redirect, sanitizzazione e vincoli password. La CSP autorizza soltanto il logo locale tramite img-src self. Nessun nuovo raster; il logo esistente resta l’asset pubblico /logo.svg. Logout nel cambio password è secondario.
