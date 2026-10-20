# Roadmap e verifica

Il master HVAC e le estensioni concordate sono implementati nel codice corrente.
Prove e limiti sono in `VERIFICATION.md`, `docs/REQUIREMENTS-AUDIT.md` e
`docs/REALISTIC-3D.md`.

| Area                | Stato verificato                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accesso e progetto  | Password hashata, cookie firmato, API/modelli protetti; schema v2, IndexedDB, recovery, CRUD, import/export.                                                  |
| Planimetria         | Disegno reale 2D, quote, snap, muri inclinati, rettangoli, irregolari, piani, adiacenza, divisione/unione. Import DXF, PDF, raster, DWG MIT.                  |
| Geometria e viewer  | Contorni netti, aree/volumi/carichi aggiornati, edit 2D/3D sincronizzato, sezioni, ombre, PBR, foto/modelli ufficiali e render PDF.                           |
| Potenza e radiatori | Volume ×35 fisso. 466 modelli Cordivari/Global/Zehnder/Lazzarini, ricerca esatta completa, immagini/finiture ufficiali.                                       |
| Terminali Ecoclima  | 127 famiglie, 1778 varianti, 6788 punti; foto originali, scelta mandata/ripresa, metri lineari e capacità per stanza. Dati incerti espliciti.                 |
| Listino e distinta  | Revisione 15-2026, prezzi/accessori originali, finiture scelte, totali noti e righe sconosciute separate dal calcolo termico.                                 |
| Canalizzato         | 21 modelli di catalogo e macchine manuali. Massima portata documentata in distribuzione, dimensionamento terminali e verifica zone indipendenti.              |
| Plenum              | Collari derivati dai dati tecnici del terminale e interfaccia macchina documentata; schema 2D/3D quotato di progetto, impostazioni indipendenti per macchina. |
| Split               | 24 unità interne e 2403 combinazioni mono/multi; matrici approvate, pose, sincronizzazione e ricaricamento.                                                   |
| Pompe di calore     | 61 modelli idronici e monoblocco Chaffoteaux, Daikin (Altherma 3 M, 3 R, 3 R MT, 3 H HT) e Gree; COP/EER, ingombri e fonti ufficiali.                         |
| VRV/VRF             | 18 unità esterne Daikin VRV IV S, mini VRV e VRV 5 S con 7 unità interne FXAA-A; capacità nominali, rapporto di connessione 50–130%, pose, 3D e PDF.          |
| Verifiche           | 534 test unitari; strict TypeScript, lint sui file modificati, build produzione.                                                                              |

Le correzioni tecniche devono continuare a preservare i cataloghi storici e le
lacune documentali. Nessun modello o accessorio riceve prestazioni o prezzi
non pubblicati; nessun risultato provvisorio di dimensionamento è applicabile.
