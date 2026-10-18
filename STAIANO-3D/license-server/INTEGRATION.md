# Licenses — integrazione universale

Servizio HTTPS per software desktop, web o mobile, indipendente dal linguaggio.
Amministrazione: https://licenses.ivanbuonocore.dev. Registrare prima il software
con **Gestisci software**, poi creare le sue licenze. Ogni chiave appartiene a un
solo prodotto; clienti, piano, funzionalità e numero di postazioni sono configurabili.

## Protocollo del client

`POST /activate`, `/verify`, `/deactivate`, con JSON:

```json
{
  "productId": "gestionale-clienti",
  "licenseKey": "LIC-XXXXX-XXXXX-XXXXX-XXXXX",
  "machineId": "mch_0123456789abcdef0123456789abcdef",
  "hostname": "PC-CLIENTE",
  "appVersion": "1.0.0"
}
```

L'app genera `machineId` da un identificativo stabile della postazione usando un
hash SHA-256, troncato a 32 caratteri esadecimali e preceduto da `mch_`.
Non inviare seriali hardware in chiaro. `hostname` e `appVersion` sono opzionali.

Attivazione e verifica restituiscono `status: active` e `token`, formato
`base64url(payload JSON).base64url(firma Ed25519)`. La firma copre i byte UTF-8
del primo segmento base64url, senza decodificarlo prima della verifica.
Chiave pubblica SPKI PEM: [license-public.pem](../deploy/license-public.pem).
La chiave privata non deve essere distribuita ai client.

Il payload contiene `v`, `licenseId`, **`productId`**, `customer`, `plan`, `seats`,
`machineId`, `features`, `issuedAt` ed `expiresAt` (secondi Unix; `null` per
licenze senza scadenza). Verificare firma, prodotto, macchina e scadenza prima
di abilitare funzionalità. Conservare chiave e token nel deposito protetto del
sistema operativo, mai nel codice frontend o nei log.
Nelle applicazioni web, effettuare le chiamate di licenza dal proprio backend:
il servizio non abilita CORS pubblico né espone chiavi nei bundle del browser.

Rinnovare online regolarmente. Revoca, chiave sconosciuta o postazione liberata
rispondono 403/404/409: bloccare immediatamente e richiedere riattivazione.
Un errore di rete non estende la tolleranza: calcolarla da `issuedAt` firmato,
non da una data modificabile nel file locale. Decidere una tolleranza breve in
funzione dell'applicazione. Un amministratore locale può modificare un client
offline: le operazioni di valore che richiedono garanzie più forti vanno
autorizzate anche sul server.

`POST /deactivate` libera il posto: cancellare i dati locali solo dopo successo.

## Compatibilità Staiano

Le vecchie chiavi `STAIANO-…` restano valide. Le nuove usano `LIC-…`.
L'assenza di `productId` nelle richieste legacy identifica `staiano-hvac`.
I token storici senza prodotto valgono solo per Staiano; le nuove integrazioni
devono richiedere sempre il proprio `productId` nel token firmato.

Il modulo `/updates/*` attuale distribuisce soltanto gli EXE Staiano.

Gli EXE Staiano verificano a ogni avvio il manifest firmato di `/updates/version`:
partono solo se il commit incorporato coincide con l'ultima release pubblicata.
Senza connessione o senza una release pubblicata, l'avvio resta bloccato.
Questo endpoint pubblica soltanto il manifest firmato, senza richiedere una
licenza già attivata: la prima attivazione resta accessibile nella versione
corrente. Download e aggiornamento continuano a richiedere una licenza valida.
L'EXE invia il proprio commit come `appVersion`; `/verify` restituisce HTTP 426
(`update-required`) alle versioni precedenti senza revocare la licenza, così
`--update` può ancora scaricare il pacchetto corrente. Le verifiche periodiche
degli EXE sono bloccanti allo scadere dell'intervallo configurato.
Il server eseguito dai sorgenti dichiara `packaged: false` nelle richieste di
licenza e resta escluso dal vincolo di versione degli EXE. I client precedenti,
che non inviano il campo, restano soggetti al controllo della revisione.

Distribuzione della prima versione con questo controllo: pubblicare prima il
pacchetto compatibile su GitHub e registrarlo nel canale aggiornamenti, poi
distribuire il Worker che impone la revisione corrente. I client precedenti
recepiscono il rifiuto al successivo controllo della licenza; non è possibile
modificare retroattivamente il loro codice di avvio o la cache offline.
L'amministrazione delle licenze rimane indipendente da tale integrazione.
