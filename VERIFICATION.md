# Verifica del rilascio — 3 ottobre 2026

Produzione: https://hvac.internal.staianopoint.com. Build `rIJ9Q0cKcLKDrGOZ5lOKh`.
Node 24.14, Next 16.3.8, React 19.3, TypeScript strict.

## Gate

- 129 unit test su 20 file superati.
- TypeScript strict, ESLint senza warning/errori e build produzione superati.
- 18 E2E Edge sull'ultima build HTTPS Caddy superati senza ignorare errori TLS.
- Audit npm delle dipendenze runtime: zero vulnerabilità; NuGet senza segnalazioni.
- Prettier: sorgenti, test e documenti principali conformi.

Copertura browser: creazione manuale, rettangoli e forme irregolari, muro inclinato
con quota di 4,23 m, quote e altezze, copia e spostamento stanza, undo e contorno
aperto, archivio e recupero, import/export, gallery Ecoclima, radiatori, canalizzato,
split, DXF/PDF, DWG nativo MIT e file danneggiato, dossier PDF, GLB ufficiali e
smartphone a 390 px. Nessuna AI/OCR, login o dipendenza cloud obbligatoria.

## Cataloghi originali

154 radiatori: 135 Ardesia a 2–6 colonne e 19 Global VIP/Oscar/Tondo. Vincoli
reali e larghezze con tappi; Global 16 bar/110 °C dalle istruzioni ufficiali.
Revisioni storiche conservate per le istanze salvate.

Ecoclima: 7 famiglie, 160 varianti, 534 punti, 16 punti in quarantena. Foto originali
locali, Q/m e unità discrete, limite acustico di 37 nel motore, lunghezze teoriche
e commerciali e pose. EADD conserva le portate a intervallo; i punti acustici
assenti non sono inventati. Nove pagine commerciali con prezzi originali restano
separate dai calcoli e dalla distinta. Date HTML non registrate: null, esplicite
nell'interfaccia e nel PDF.

21 abbinamenti canalizzati reali di tre marchi; 24 split e 2403 combinazioni
mono/multi con capacità simultanee per stanza. SKU regionali e disponibilità
italiana espliciti. 18 OBJ Ardesia convertiti in 24,8 MB di GLB, hash e dimensioni
controllati. La larghezza mesh supera di 9,2 mm quella catalogata: anteprima
disponibile, esclusa dalla posa verificata. Archivio Gree Revit acquisito,
senza sostituire modelli estranei ai GUD. Nessun dato tecnico sintetico.

## Geometria, prestazioni e PDF

Stanze nette, multipiano, adiacenza, divisione/unione, snap e misure verificati.
La divisione eredita l'altezza; l'unione con altezze diverse richiede una scelta
esplicita. La ricalibrazione conserva gli ingombri fisici. Contorni aperti
conservano dati e apparecchi; lo stato irrisolto blocca il dimensionamento.
Campi legacy ignoti restano null/unknown. Collisioni verificate in pianta e quota.

Fixture con 200 muri, 50 stanze e 100 radiatori reali: ricalcolo, validazione,
repository, reload e orbit 3D superati. Campionamento durante orbit: mediana
frame 8,3 ms, P95 circa 8,6 ms, interazione 151 ms. Risultati riferiti alla macchina
di verifica. Metriche in output/verification/browser-performance.json.

Dossier reale di 11 pagine in output/pdf/staiano-dossier-verifica.pdf: copertina
con logo, riepilogo, A3 vettoriale con codici e legenda, schede stanza, impianti,
terminali, radiatori, materiali con locali e prestazioni, controlli, fonti con SHA
e disclaimer richiesto. Tutte le pagine renderizzate e ispezionate; zero caratteri
fuori pagina. Forme circolari, quote sconosciute e codici sopra gli ingombri verificati.

## HTTPS Caddy

DNS: 192.168.178.9. Caddy 2.11.4 usa il wildcard Let's Encrypt esistente con
rinnovo DNS-01. Proxy HVAC verso 127.0.0.1:3015 aggiunto con ETag; nove route
precedenti preservate. Il file principale differisce solo per l'import HVAC;
backup conservato. Token Cloudflare protetto da ACL non letto o modificato.

Verifica TLS standard senza bypass: SAN `*.internal.staianopoint.com`, scadenza
4 dicembre 2026, home e logo HTTP 200, HSTS ereditato. Server produzione senza
finestra; PID e build ID in .cache/production-server.json.
Prova aggiornata in output/verification/https.json.

## Ricerca e limiti dichiarati

Il solver radiatori effettua ricerca completa fino alla prova di ottimalità oppure
all'annullamento esplicito: nessun limite automatico di stati o timeout.
A ΔT nominale usa una rappresentazione esatta dei decimali pubblicati; ad altri
ΔT continua la ricerca completa nel worker. Potenze originali conservate, deficit
vietato. Marca e famiglia libere permettono combinazioni fra produttori;
ogni batteria conserva fonte e versione. Oracle brute force con 3–5 batterie
a ΔT 50/40 e casi reali con 10 batterie verificati. La complessità può richiedere
tempo, senza bloccare l'editor.

DWG nativo con ACadSharp 3.8.0 MIT e .NET 8 o superiore locale: binario reale,
layer e unità, stanza di 15,96 m², autosave e reload verificati via HTTPS.
ODA commerciale disattivato; nessuna licenza ODA richiesta al parser MIT.
Runtime di circa 1,4 MB, notice e hash inclusi. Helper con memoria di 512 MB,
timeout di 30 s, input/output di 32 MB e controllo di host e origine.

Versioni e proxy non supportati richiedono correzione o esportazione, senza
geometrie inventate. Dati catalogo originali mancanti restano espliciti.
Prima di redistribuire pubblicamente verificare i diritti degli asset produttore.
Nessuna pubblicazione esterna eseguita. Audit completo in docs/REQUIREMENTS-AUDIT.md.
