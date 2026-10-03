# Roadmap e criteri di completamento

Ogni milestone richiede comportamento reale, salvataggio, reload, validazione,
test ed errori gestiti. Una schermata o funzione isolata non chiude una milestone.

| Milestone           | Risultato richiesto                                                        | Stato effettivo                                                                                   |
| ------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1 Fondamenta        | Next strict, schema, IndexedDB, autosave/recovery, import/export, archivio | Verificata                                                                                        |
| 2 Geometria/manuale | Muri, quote, snap, stanze nette, adiacenza, split/merge, multipiano        | Base operativa; hardening in corso                                                                |
| 3 3D                | Estrusione, camere, selezione sincronizzata, isolamento, apparecchi        | Muri, stanze e radiatori verificati; altri apparecchi con 7–8                                     |
| 4 Termico           | Superficie netta × altezza × 35, formule e aggiornamento                   | Verificata                                                                                        |
| 5 Radiatori         | Ardesia 2–6, VIP, Oscar, ΔT, vincoli, combinazioni, posizionamento         | In corso: 154 varianti reali, solver e 2D/3D verificati; varianti miste e collisioni da estendere |
| 6 Ecoclima          | Fonti, gallery, operating point, rumore, lunghezze, mandata/ripresa        | In corso: 144 varianti, 490 punti, gallery e calcoli; persistenza e posizionamento da collegare   |
| 7 Canalizzato       | Cataloghi tre marchi, selezione macchina, portate, terminali               | Da implementare                                                                                   |
| 8 Split             | Tre marchi, mono/multisplit da matrici ufficiali, posizionamento           | Da implementare                                                                                   |
| 9 PDF               | Dossier, pianta, schede, materiali, controlli, nota convenzionale          | Da implementare                                                                                   |
| 10 Hardening        | Import PDF/DXF/DWG, sicurezza, performance, UX e verifiche                 | In corso: raster, worker progetto e test; resto da completare                                     |

## Primo task del brief

Documenti architetturali, tipi, schema, formato, autosave/import/export, primo
editor manuale, termico, test e avvio reale eseguiti. Proseguire senza sostituire
le parti funzionanti con mock. L'obiettivo generale resta attivo.

Risultati e limiti in VERIFICATION.md. Stato per proseguire in CONTINUATION.md.
