# Roadmap e criteri di completamento

Il criterio resta quello del brief: comportamento reale, salvataggio, reload,
validazione, test ed errori gestiti. Obiettivo complessivo attivo finché l’audit
non prova tutti i requisiti, senza scambiare limiti dichiarati per dati verificati.

| Milestone     | Stato corrente e prove                                                                                                                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Fondamenta  | Schema v2, migrazioni, repository IndexedDB, autosave seriale, recovery e CRUD/import-export: unit ed E2E verificati.                                                                                           |
| 2 Geometria   | Creazione manuale primo livello, quote nette/esatte, snap, irregolari/adiacenti, divisione/unione con altezze esplicite, gruppo copia/drag: verificati. Contorni incompleti conservati e bloccati tecnicamente. |
| 3 3D          | Stanze/muri/apparecchi, alto/prospettiva/isola/sezione, syncselection e grande scena: verificati in Edge. 18 modelli ufficiali in preview, incongruenza quote esplicita.                                        |
| 4 Termico     | Area netta × altezza ×35 fisso, Watt e BTU corretti, aggiornamenti e formule visibili: verificati.                                                                                                              |
| 5 Radiatori   | 154 varianti reali, ΔT, vincoli, combinazioni miste/alternative e posizionamento: verificati. Ricerca completa con prova di ottimalità, progress/cancel e marchi/famiglie liberi.                               |
| 6 Ecoclima    | 7famiglie,160varianti,534punti (16quarantinati), gallery e ingombri, mandata/ripresa e punti persistenti: verificati. EADD prestazioni assenti escluso.                                                         |
| 7 Canalizzato | 21abbinamenti reali3marchi, portate/pressione/capacità/riparto, punti e controlli: unit/E2E verificati.                                                                                                         |
| 8 Split       | 24interni,2403combinazioni mono/multi originali3marchi, capacità simultanee/pose/refresh/reload: verificati; fonti regionali e disponibilità esplicite.                                                         |
| 9 PDF         | Dossier locale reale con logo, A3 vettoriale, schede, materiali/locali/prestazioni, controlli/fonti/note: unit/E2E e render verificati.                                                                         |
| 10 Hardening  | DXF/PDF/raster,200muri/50stanze/100devices, legacy/null/history, collisioni e responsive: verificati. Audit finale e gate produzione verificati; DWG nativo MIT con subset/versioni dichiarati.                 |

Prove in VERIFICATION.md; tracciamento completo in docs/REQUIREMENTS-AUDIT.md.
Non introdurre AI, mock tecnici, prezzi nel calcolo o dati catalogo inventati.
