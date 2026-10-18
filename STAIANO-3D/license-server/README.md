# Servizio licenze (Cloudflare Worker + D1)

## Pannello universale e passkey

Il pannello su **https://licenses.ivanbuonocore.dev** amministra più software:
**Gestisci software** registra un prodotto; ogni licenza è associata al relativo
ID e i token firmati impediscono l'uso su software diversi. Le chiavi nuove
iniziano con `LIC-`; quelle storiche `STAIANO-` restano valide.
Protocollo per integrare altri software: [INTEGRATION.md](INTEGRATION.md).

**Accedi con passkey** usa WebAuthn con verifica utente obbligatoria, challenge
monouso di due minuti e sessione di otto ore con cookie Secure/HttpOnly/Strict.
Per la prima registrazione, accedere con il token amministratore esistente e
premere **Registra passkey**, confermando con Windows Hello, telefono o chiave
FIDO2. La chiave privata della passkey non lascia l'autenticatore. Il token
amministratore può essere usato per il bootstrap; non inserirlo nel frontend o nei log.

Su questa installazione il token amministratore è stato revocato dopo la
registrazione della passkey: il Worker non contiene più `ADMIN_TOKEN` e
`.env.local` non contiene più `LICENSE_ADMIN_TOKEN`. L'accesso amministrativo
avviene tramite passkey. Gli script `license:issue` che richiedono il vecchio
token non possono amministrare questo servizio. Un eventuale ripristino del
bootstrap richiede un'azione esplicita del proprietario su Cloudflare.

Le migrazioni `0002-products.sql` e `0003-passkeys.sql` sono già applicate al
database esistente. Per database nuovi usare lo schema completo `schema.sql`.
Non riapplicare `0002` a un database già migrato. Pubblicazione:
`npm run license:deploy`, che compila anche il client WebAuthn.

Pacchetti EXE e canale di aggiornamento: [deploy/ci/README.md](../deploy/ci/README.md).
Le release si producono dalla copia di sviluppo con `compila.bat`, che richiede il
segreto `PUBLISH_TOKEN` sul Worker e i token `GITHUB_TOKEN` e
`LICENSE_PUBLISH_TOKEN` in `.env.local`. Il canale diventa operativo con la prima
release pubblicata e collaudata; il pannello ne mostra lo stato.

Servizio **generale** di licenze: ogni licenza appartiene a un cliente e a una o
più postazioni, per qualunque software che ne incorpori la chiave pubblica. Il
Worker è l'unico detentore della chiave privata di firma: emette token
**Ed25519** che l'app verifica offline, e resta il punto unico di attivazione,
revoca e spostamento della licenza fra postazioni.

- `POST /activate` — attiva la postazione (la lega al `machineId`) e restituisce il token firmato.
- `POST /verify` — rinnova il token e comunica la revoca; usato a intervalli dall'app.
- `POST /deactivate` — libera la postazione (posti disponibili).
- `GET  /health` — stato del servizio.
- `POST /admin/licenses` · `GET /admin/licenses` · `POST /admin/licenses/:id/revoke|restore|release` — amministrazione, protetta da `Bearer ADMIN_TOKEN`.

I dati stanno in **D1** (`licenses`, `activations`); della chiave di licenza è
salvato solo l'hash SHA-256, quindi la chiave in chiaro viene mostrata **una sola
volta** al momento della creazione.

Il servizio è pubblicato su **https://licenses.ivanbuonocore.dev** (dominio
personalizzato del Worker, configurato in `wrangler.toml` tramite
`routes = [{ pattern = "licenses.ivanbuonocore.dev", custom_domain = true }]`).

> **Stato (18/10/2026).** Il servizio è già in linea: Worker `licenses`, D1
> `licenses` (`4df77dd3-41da-41a4-8bd9-73bb843accc6`), schema applicato, segreti
> `LICENSE_PRIVATE_KEY` e `ADMIN_TOKEN` caricati, licenza `lic_5a80f428c3c98655`
> attiva sulla postazione di produzione (`LICENSE_ENFORCE=1` in `.env.local`,
> tolleranza offline un giorno).
> I passi da 1 a 4 qui sotto vanno rifatti solo per un servizio nuovo, o dopo
> la rotazione delle chiavi.

## 1. Chiavi di firma

```powershell
npm run license:keys
```

Genera `.cache/license-private.pem` (segreto del Worker) e
`.cache/license-public.pem` (usata dall'app locale). `.cache/` è escluso dal
repository: la chiave privata non va mai committata.

La stessa coppia di chiavi serve tutti i software installati: la chiave pubblica
va incorporata nell'app, quella privata resta solo sul Worker.

## 2. Progetto Cloudflare

```powershell
npx --yes wrangler@latest login                 # oppure CLOUDFLARE_API_TOKEN
npx --yes wrangler@latest d1 create licenses -c license-server/wrangler.toml
```

Copia il `database_id` restituito dentro `license-server/wrangler.toml`
(al posto di `SOSTITUIRE_CON_DATABASE_ID`), poi:

```powershell
npm run license:db:init          # applica license-server/schema.sql
Get-Content .cache/license-private.pem -Raw | npx --yes wrangler@latest secret put LICENSE_PRIVATE_KEY -c license-server/wrangler.toml
npx --yes wrangler@latest secret put ADMIN_TOKEN -c license-server/wrangler.toml
npm run license:deploy
```

Prima di pubblicare conviene verificare il bundle senza deploy:

```powershell
npx --yes wrangler@latest deploy --dry-run -c license-server/wrangler.toml
```

Il deploy crea anche il dominio personalizzato `licenses.ivanbuonocore.dev`
(richiede che la zona `ivanbuonocore.dev` sia sull'account). L'URL
`licenses.<sottodominio>.workers.dev` resta attivo come alternativa.

## 3. Configurazione del server locale (Staiano)

Nell'ambiente del processo `next start` (attività «Staiano HVAC»):

```
LICENSE_SERVER_URL=https://licenses.ivanbuonocore.dev
LICENSE_PUBLIC_KEY_FILE=.cache/license-public.pem
LICENSE_ENFORCE=1
# facoltativi
LICENSE_TOLERANCE_MINUTES=1440 # quanto a lungo un token resta valido senza contattare il server (un giorno)
LICENSE_CHECK_MINUTES=10       # ogni quanto rinnovare il token
LICENSE_FILE=.cache/license.json
```

Senza `LICENSE_ENFORCE=1` il controllo resta **disattivato**: l'app si comporta
come prima e la sezione _Licenza_ mostra solo lo stato informativo.

## 4. Emissione e attivazione

```powershell
npm run license:issue -- create --customer "Termoidraulica Rossi" --seats 1
npm run license:activate -- activate STAIANO-XXXXX-XXXXX-XXXXX-XXXXX
npm run license:activate -- status
```

`license:issue` richiede `LICENSE_SERVER_URL` e `LICENSE_ADMIN_TOKEN`
(anche in `.env.local`). `license:activate` scrive `.cache/license.json`, lo
stesso file che usa l'app.

## 5. Revoca e spostamento

```powershell
npm run license:issue -- list
npm run license:issue -- revoke lic_xxxxxxxx        # blocca ogni postazione della licenza
npm run license:issue -- restore lic_xxxxxxxx       # annulla la revoca
npm run license:issue -- release lic_xxxxxxxx --machine mch_....   # libera un posto
```

Alla revoca l'app si blocca alla prima verifica utile (entro
`LICENSE_TOLERANCE_MINUTES`). Lo spostamento su un'altra macchina richiede la
disattivazione dalla postazione precedente (`npm run license:activate --
deactivate`, o il pulsante nella sezione _Licenza_ dell'area amministratore)
oppure `release` da qui.

## 6. Diagnostica

- `GET /health` deve rispondere `{"ok":true}`.
- Se il Worker non ha `LICENSE_PRIVATE_KEY` risponde `503` sulle rotte pubbliche.
- Se l'app risponde `403 {"licenseRequired":true}` o reindirizza a `/licenza`, la
  licenza non è attiva: la pagina `/licenza` mostra stato, postazione e chiave
  pubblica caricata.
