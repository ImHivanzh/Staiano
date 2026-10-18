# Verifica del rilascio — 4 ottobre 2026

Produzione: https://hvac.internal.staianopoint.com. Build `G6T81v8TT_frZV_5OSgpC`.
Certificato wildcard Let's Encrypt, SAN `*.internal.staianopoint.com`; rinnovo Caddy DNS-01.
Node 24.14, Next 16.3.8, React 19.3, TypeScript strict.

## Gate

- 228 test unitari su 35 file superati.
- TypeScript strict, ESLint senza warning o errori, build produzione superati.
- 33 test Edge sul dominio HTTPS reale, TLS verificato senza bypass.
- Il test DWG rifiuta il binario danneggiato preservando il progetto.
- Login e logout, protezione pagine/API/modelli/worker, limiti tentativi e origin verificati.
- Home anonima reindirizza al login; API DWG e GLB non autenticati: HTTP 401. Logo pubblico: HTTP 200.
- Password hash scrypt privata, sessione HMAC 8 ore, cookie HttpOnly/SameSite Strict/Secure su HTTPS, logout, rate limit e verifica Origin.
- Zero warning Next/Turbopack; inventari `.nft.json` senza `.cache`, `.env`, credential o corpus sorgente.
- `next build` produce zero warning e nessun trace di cache/credenziali.
- npm audit runtime: zero vulnerabilità; NuGet senza vulnerabilità segnalate.
- Prettier, ESLint e TypeScript passati.

Copertura browser: manuale, quote e muri inclinati; selezione/drag/undo;
import/export/reload e recovery; 3D grande scena e telefono; aperture misurate;
radio/split/canalizzato/terminali; nuove famiglie e colori radiatori; fotografie
Ecoclima; macchina manuale e portata massima; ripresa e mandata indipendenti;
stacchi e plenum macchina; listino/accessori; render JPEG e PDF; annullamento render.

## Cataloghi

Radiatori: 466 varianti Cordivari/Global/Zehnder/Lazzarini con immagini ufficiali;
206 finiture di catalogo per corpo/accessori, limitate alle combinazioni pubblicate.
Il dimensionamento usa potenze e coefficienti di catalogo; il colore non cambia Q.
Alcune geometrie Zehnder/Lazzarini sono dichiarate schematiche: ingombri di catalogo
restano distinti dalla sagoma illustrativa.

Ecoclima: 127 famiglie, 1778 varianti, 6788 punti; 536 punti in revisione e 612
con rumore sconosciuto, esclusi dall'automazione quando il dato manca.
Inventario ufficiale: 109 pagine terminali/accessori. 6718 prezzi e 873 schede
accessori nel listino locale 15-2026; fonti originali/hash preservati. 112 famiglie
tecniche con corrispondenza commerciale esatta su 127. SKU e prezzi mancanti
restano `Da verificare`; il subtotale non viene presentato come totale completo.
Foto originali locali e hash delle fonti nei manifest.

Canalizzati: 21 modelli originali. La portata massima pubblicata guida selezione,
refresh, validazione, mandata, ripresa e stacchi. Valori verificati in snapshot:
Mitsubishi 840, Daikin 900, Gree 600 m³/h per i modelli di riferimento provati.
Macchina manuale: marca/modello/massimo dichiarati dall'operatore, potenza opzionale.

Split: 24 unità interne e 2403 combinazioni approvate di tre marchi; capacità
simultanee per ambiente, senza somma non supportata. Compatibilità regionale esplicita.

## 3D, plenum e PDF

Il 3D usa intonaco, legno e pietra PBR locali CC0, luci da studio, ombre,
occlusione ambientale, aperture misurate e apparecchi riconoscibili.
Sezione davanti alla camera, muri posteriori ad altezza reale, orientamento,
focus/isola, orbit e fullscreen. Render reali 1600×900 inseriti nel dossier A4
orizzontale. Dati non noti (come davanzali storici) non diventano fori inventati.

Per ogni macchina il plenum usa attacco OEM documentato oppure misure manuali. Ogni
stacco e diametro viene dalle specifiche del plenum Ecoclima del terminale scelto.
Il corpo e la transizione hanno quote di progetto calcolate dal raccordo, angolo,
collari e portate. La lista prezzi comprende voce terminale, plenum isolato, ponti
e kit quando richiesti dalla documentazione. Il plenum macchina su misura non ha
prezzo Ecoclima pubblicato, perciò resta da quotare.

Fixture 200 muri/50 stanze/100 apparecchi; selezione reale 2D/3D; due zone
canalizzate modificate e ricaricate senza alterare l'altra; ripresa e mandata
separate e pareti/stanze aggiornate. Render verificato nella [prova PDF](/C:/local-software/staiano-3d/output/verification/autonomous-plenum-render.pdf).

## Accesso

Configurazione locale protetta: `.cache/app-auth.json`, segreto scrypt e firma
sessione, file con ACL proprietario/SYSTEM/amministratori. Cookie HttpOnly,
SameSite Strict, Secure su HTTPS, validità 8 ore. La password non è inclusa
nel bundle né in Git; login limitato, logout revoca cookie. Accesso protetto
anche per API, worker, foto, modelli e JavaScript. Hashconfig non va copiato
tra server. Cambio password: `node scripts/configure-access.mjs --stdin --rotate`.
Revocare tutte le sessioni: `node scripts/configure-access.mjs --rotate-session-only`.

## Limiti

Il plenum macchina è un progetto di fabbricazione: verificare flange, tenuta,
rumore e perdite prima di costruire. Il raccordo reale può avere area libera
diversa dal nominale. Scarico termico/calcoli di potenza restano limiti
convenzionali dichiarati. Prestazioni assenti ed errori sorgente non vengono
sostituiti da valori stimati.
