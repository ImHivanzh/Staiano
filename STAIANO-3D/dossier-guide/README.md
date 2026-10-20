# Guida al dossier Staiano

Worker pubblico: https://staiano-dossier.ivanbuonocore7.workers.dev/

Da STAIANO-3D: `npx wrangler deploy -c dossier-guide/wrangler.toml`.

Ogni dossier completo o sintetico include in copertina un QR cliccabile. Il riepilogo contiene titolo, data, variante, totali, conteggi degli apparecchi e dei controlli, fino a 12 nomi ambiente. I nomi lunghi sono limitati; il PDF conserva tutti i dettagli.

La generazione comprime il riepilogo e lo cifra con una chiave AES-256-GCM casuale e un nonce casuale per ogni esportazione. La chiave AES è protetta con RSA-OAEP/SHA-256. Nell’app e nel repository c’è solo la chiave pubblica (`public-key.json`). Il QR contiene esclusivamente la busta cifrata nel frammento URL.

La pagina invia la busta cifrata via HTTPS a POST /api/dossier. Il Worker la decifra con il segreto DOSSIER_PRIVATE_KEY, limita corpo e decompressione, valida lo schema e risponde con Cache-Control: no-store. Non è configurato alcun database o log del contenuto. I dati decifrati restano in memoria nella pagina e i testi sono inseriti con textContent. Chi riceve PDF o collegamento può aprire il riepilogo: il QR è un accesso al contenuto. Allegati, disegni e progetto completo restano fuori dal QR.

Chiavi: `node scripts/dossier-keys.mjs` genera una coppia solo quando entrambe le chiavi sono assenti. La privata è in `.cache/dossier-private.pkcs8` (ignorata da Git). Caricarla con `Get-Content .cache/dossier-private.pkcs8 -Raw | npx wrangler secret put DOSSIER_PRIVATE_KEY -c dossier-guide/wrangler.toml`. Conservare una copia privata sicura: sostituire o perdere la chiave impedisce di aprire i QR già emessi. Non rigenerarla durante le build.

Verifiche: `npx vitest run src/services/pdf/dossier-guide.test.ts`; anteprima: `npx wrangler dev -c dossier-guide/wrangler.toml`, configurando lo stesso segreto soltanto nell’ambiente locale.
