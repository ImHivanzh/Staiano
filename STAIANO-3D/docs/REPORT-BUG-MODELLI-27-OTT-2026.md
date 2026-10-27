# Report bug, modelli 3D e dati tecnici — 27 ottobre 2026

## Gate
- `tsc --noEmit` pulito; ESLint pulito sui file toccati.
- Vitest: 980/990. I 10 falliti sono tutti `src/server/auth.test.ts`: `whoami.exe` non parte nella sandbox (`Command failed: whoami.exe /user`). Ambientale, non di codice. Da rieseguire fuori sandbox.

## Bug di posizionamento corretti
1. **Plenum a soffitto su solaio a filo** (`domain/ducted/attached-plenums.ts`, `attachedPlenumPose`). La modifica non committata aveva tolto il controllo `inVoid`: il plenum saliva sempre sopra la bocchetta, oltre la quota del soffitto, e il test era stato riscritto per accettare le collisioni. Ripristinato: senza vuoto il plenum resta sotto il solaio, di fianco alla bocchetta, con quota limitata a `roof`. Test `collisions.test.ts` riportato alla versione originale.
2. Controllati e coerenti: plenum macchina mandata/ripresa (direzione e distacco uguali in `placement.ts` e `attachedPlenumPose`), FCZ P/PO canalizzato in 3D (doppia rotazione a soffitto che si annulla), incasso FCZ PO con controparete (`fanCoilWallRecess`).

## Modelli 3D confrontati con le foto dei produttori
| Modello | Esito |
| --- | --- |
| EBL | **Sbagliato, corretto.** 27 lamelle sottili contro le ~10 barre fisse con distanziali della foto. Ora 10 barre + 2 distanziali (`scripts/blender/ecoclima-grilles-realistic.py`, rigenerati GLB e `.blend`; copia precedente `ecoclima-grilles-realistic.blend.bak`). |
| EGF-PUSH | Coerente (frontale forato, botola animata). |
| EDLS | Coerente: il bordo bianco è il gesso finito, dichiarato nello script (le ali forate restano nascoste). |
| EDFL 3 feritoie | Coerente con la variante a 3 feritoie; la foto del catalogo mostra la 2. |
| EGA6 | Approssimato: 14 lamelle a 45° contro ~9–10 della foto. Non modificato. |
| Innova Filomuro Slim Fit | **Mancava.** Aggiunto (vedi sotto). |
| Non riesaminati in questa sessione | Global VIP/OSCAR, Innova SLI/OSMO, Aermec FCZ, Gree U-Match. Le immagini sono in `output/verifiche-realismo/`. |

## Innova Filomuro Slim Fit (nuovo)
- Fonte: https://www.innova.it/prodotti/fancoils/filomuro/filomuro/ (archiviata in `catalog-data/sources/innova/`, registrata nel manifest).
- Dati pubblicati: SW 400/600/800 = 815/1015/1215 × 335 × 128 mm; freddo 1,24/1,61/1,94 kW (7/12 °C, 27 °C); caldo 1,50/2,01/2,35 kW (45/40 °C, 20 °C); Eurokonus 3/4" lato DX.
- **Non pubblicati**, lasciati `null`/assenti: portata aria, rumore, foto, modalità di posa (incasso o no), numero tubi (assunto 2). Nessun dato inventato.
- Modello: `public/models/hvac/innova-filomuro-realistic.glb`, sorgente `scripts/blender/innova-filomuro-realistic.py`, `assets/blender/innova-filomuro-realistic.blend`. Mandata/ripresa a feritoia sono illustrative: il sito non ha immagini.
- Verifica: bbox 1,015 × 0,128 × 0,335 m; posa a parete valida, non a incasso, nessun errore di validazione (solo avviso «rumore non disponibile»). Test aggiunto in `fan-coil-airleaf.test.ts`.

## Dati tecnici
- Nessun valore corretto: gli errori certi non emergono senza i PDF originali.
- Anomalie solo euristiche (non errori accertati): Innova SL/SLI 4 tubi con resa invernale < 80% di quella estiva (batteria caldo a una fila: plausibile). Elenco in `catalog-anomalies.txt` della cartella temporanea di sessione.
- Portate Gree GUD in ordine decrescente (SH→L): voluto.

## Non fatto
- Nessun test browser/e2e, nessuna build di produzione, nessun riavvio del server Staiano.
- Nulla committato.
