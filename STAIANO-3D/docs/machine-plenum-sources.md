# Plenum di mandata specifico della macchina

Il raccordo iniziale deriva dal disegno dell'unità interna selezionata. Il corpo successivo è un progetto su misura, calcolato dagli stacchi effettivi dei terminali. Non è un accessorio OEM né un prodotto Ecoclima. La dimensione del carter non viene usata come apertura di mandata.

## Fonti delle 21 macchine

| Unità interna | Raccordo documentato L × H, mm | Fonte e riferimento |
| --- | --- | --- |
| PEAD-M35/50JA2 | 860 × 178 | Mitsubishi Electric, scheda dimensionale maggio2024, PDF pagina2, D(Duct) e178(Duct) |
| PEAD-M60/71JA2 | 1060 × 178 | Stesso disegno |
| PEAD-M100/125JA2 | 1360 × 178 | Stesso disegno |
| PEAD-M140JA2 | 1560 × 178 | Stesso disegno |
| FBA35/50A9 | 515 × 178, quote trasversali flangia | Daikin, 3D094988B e3D094918B, PDF pagina1 |
| FBA60/71A9 | 815 × 178, quote trasversali flangia | Daikin, 3D094983B e3D094915B, PDF pagina1 |
| FBA100/125/140A | 1215 × 178, quote trasversali flangia | Daikin, 3D094914B, PDF pagina1 |
| GUD35PS1/A-S | 585 × 122 | Gree, IM_U-Match-Duct, PDF pagina35 / stampata31, tabella2.2.7.1, Supply Air Outlet A/B |
| GUD50PS1/A-S | 885 × 122 | Stessa tabella |
| GUD71/85PHS1/A-S | 740 × 215 | Stessa tabella |
| GUD100/125PHS1/A-S | 1153 × 215 | Stessa tabella |
| GUD140PHS1/A-S | 1151 × 197 | Stessa tabella |

Daikin distingue `dimensionBasis: flangeMountingSpan`. La larghezza netta della luce è492/792/1192mm; l'altezza netta non è quotata separatamente. Il progetto usa le quote documentate della flangia come interfaccia. Non dichiara178mm come altezza libera certificata. Profondità del collare documentata: Mitsubishi15mm, Daikin25mm; Gree non pubblicata in questa tabella.

Fonti originali:

- [Mitsubishi Electric PEAD-M JA2 dimensional sheet](https://library.mitsubishielectric.co.uk/pdf/download_full/4173)
- [Daikin FBA35A9 dimensional drawing](https://www.daikin.es/content/dam/MDM/TechnicalDrawings/SkyAir/FBA-A(9)/fba35a9_dim_3d094988b_en.pdf)
- [Daikin FBA100-140A dimensional drawing](https://www.daikin.es/content/dam/MDM/TechnicalDrawings/SkyAir/FBA-A/EN/fba100-140a_dim_3d094914b_en.pdf)
- [Gree installation manual, all selected indoor models on cover](https://gree.gr/wp-content/uploads/2025/07/IM_U-Match-Duct.pdf)

URL, SHA256, pagina, revisione e data di acquisizione sono conservati nel catalogo. Manifest separato: `catalog-data/sources/hvac/connections-manifest.json`. Curation verificata sul disegno: `catalog-data/curation/hvac-connections.json`. PDF originali sono cache locali escluse da Git; acquisizione ripetibile tramite `scripts/catalog-import/hvac-connections-acquire.py`. Nessun OCR o interpretazione delle sole proporzioni del disegno viene usato per creare quote mancanti.

## Geometria del corpo su misura

Origine al centro del raccordo macchina; asse Z segue la mandata. Diametri e quantità arrivano dalla distinta dei collegamenti dei terminali, non dal calcolo di un diametro nominale generico.

Gli stacchi vengono disposti per file con diametri reali differenti. Larghezza iniziale non inferiore al raccordo macchina e al maggiore stacco più i margini. Se una fila non contiene lo stacco successivo, viene creata una nuova fila. Altezza contiene tutte le file, i margini e le distanze impostate. Una larghezza personalizzata insufficiente produce un errore, non riduce i diametri.

La transizione centrata ha lunghezza `max((Lcorpo-Lraccordo)/2,(Hcorpo-Hraccordo)/2)/tan(angoloSemilato)`, arrotondata per eccesso ai10mm. Angolo predefinito7,5° per lato,15° totale. [Fantech Do’s and Don’ts](https://www.fantech.com.au/Content.aspx?ContentID=L5&category=dos-and-donts) pubblica il criterio15° totale per collegamenti di ventilatori. Qui il criterio è una scelta geometrica conservativa da verificare nell'applicazione al canalizzato; non viene presentato come certificazione OEM o verifica delle perdite.

Parametri di fabbricazione espliciti e modificabili: margine25mm, spazio tra stacchi30mm, collare60mm, corpo diritto minimo300mm. Sono scelte di progetto, non dimensioni pubblicate dal produttore. Il corpo diritto è almeno pari al diametro maggiore. Quote finali includono transizione, corpo diritto, collari, diametri e coordinate degli assi. Pianta, prospetto e3D devono usare la stessa geometria.

Restano da verificare prima della costruzione: foratura completa, ingombro esterno della flangia, guarnizione, tolleranze, spessore e isolamento, supporti, perdite di carico, bilanciamento, spazi di manutenzione e misura della luce Daikin. Campi non documentati restano `null`; non vengono ricavati dal carter.

## Cataloghi storici

Prestazioni e abbinamenti storici restano immutati. Un progetto vecchio può ricevere soltanto il disegno aggiuntivo dello stesso produttore e della stessa esatta unità interna. `hvacDischargeConnection` conserva i metadati della fonte aggiuntiva. Modelli sconosciuti non ereditano dimensioni da una famiglia simile.
