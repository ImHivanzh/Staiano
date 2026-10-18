# Licenses

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Il proprietario del servizio e gli amministratori autorizzati gestiscono licenze,
software e postazioni. Il pannello deve permettere il confronto tra clienti e
la verifica dei posti disponibili su desktop, tablet e telefono.

## Product Purpose

Registrare software, creare e modificare licenze, consegnare chiavi mostrate una
sola volta, revocare e ripristinare l'accesso, controllare e liberare postazioni.
Il pannello è universale; il canale dei pacchetti attuale riguarda Staiano HVAC.

## Capabilities and Constraints

HTML, CSS e JavaScript nativi serviti dal Worker Cloudflare, database D1 e
WebAuthn. Nessuna dipendenza UI aggiuntiva. Login con passkey e bootstrap con
token soltanto quando abilitato dal server. Nessuna modifica ad autenticazione,
chiavi, segreti o dati reali attraverso il redesign.

## Brand Commitments

Nome Licenses, interfaccia in italiano. Console scura e tecnica richiesta
esplicitamente dall'utente. Testi leggibili, dati tabulari, azioni riconoscibili.
Il tema dell'applicazione HVAC resta indipendente dal pannello amministrativo.

## Evidence on Hand

README.md, INTEGRATION.md, API del Worker e test browser con database locale e
autenticatore virtuale. Gli screenshot di collaudo contengono soltanto dati fittizi.

## Product Principles

- Cliente, software, occupazione e stato si leggono sulla stessa riga.
- I dettagli delle postazioni si costruiscono quando vengono aperti.
- Filtri e azioni esplicitano il proprio ambito.
- Chiavi e credenziali mantengono il comportamento di sicurezza esistente.
