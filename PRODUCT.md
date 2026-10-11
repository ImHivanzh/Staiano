# Staiano HVAC

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Operatori di Termoidraulica Staiano che progettano impianti HVAC. Priorità confermata: progettazione quotidiana 2D/3D, più spazio per il modello e comandi chiari.
Il programma viene usato su PC, solitamente a 1920×1080, e su iPad. Le verifiche dell’interfaccia si concentrano su questi dispositivi; gli smartphone sono fuori dallo scope richiesto.

## Product Purpose

Costruire una planimetria con misure reali, definire ambienti e fabbisogno, configurare apparecchi e produrre un dossier preliminare.
Il wizard configura un impianto per volta tramite “Aggiungi impianto”. Ogni impianto
ha un solo tipo e conserva le proprie stanze, apparecchi e impostazioni. Un nuovo
impianto parte dalla singola stanza scelta; la stessa stanza può appartenere a più
impianti distinti. La vista complessiva mostra insieme tutti gli apparecchi.
EDLS, EDFL ed EDSC-C sono le scelte principali delle bocchette.
Per la ripresa la scelta principale è EGA6 con chiusura Push a richiesta. Il limite
di 37 dB(A) vale soltanto per la mandata. La ripresa complessiva si confronta con
la portata totale della macchina; dimensioni e distribuzione sono scelte dall’operatore.
La vista cliente si apre in una finestra separata sullo stesso computer e browser,
da spostare sulla TV collegata. Mostra il modello live senza i controlli del configuratore.

## Capabilities and Constraints

Next.js 16, React, CSS condiviso Staiano e CSS specifico dell'applicativo. Editor 2D, viewer Three.js, importazione DWG/DXF/PDF/immagini, cataloghi locali, listino e PDF. Autenticazione interna con ruoli amministratore e operatore. Progetti in IndexedDB separati per utente e origine; esportazione `.hvacproj` per trasferimento e backup. Le finiture 3D sono illustrative. Il redesign conserva calcoli, cataloghi, autenticazione, dati e azioni esistenti.

## Brand Commitments

Nome e logo Staiano esistenti. Interfaccia in italiano. Colori del logo blu, ciano e verde. Il foglio condiviso `public/sistema.css` si distribuisce da un altro progetto: personalizzare qui solo i fogli dell'applicativo.

## Evidence on Hand

README.md, ARCHITECTURE.md, cataloghi e asset locali, fixture `.hvacproj`, test Playwright. Nessuna nuova affermazione commerciale richiesta.

## Product Principles

- Il modello e la planimetria ricevono la maggior parte dello spazio disponibile.
- Strumenti di disegno, navigazione, apparecchi e documenti hanno gruppi riconoscibili.
- Le proprietà restano contestuali alla selezione e richiudibili.
- Tastiera, stati di salvataggio, errori e controlli tecnici restano visibili e accessibili.
