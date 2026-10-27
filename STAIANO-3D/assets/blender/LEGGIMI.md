# Modelli HVAC modificabili

`modelli-hvac.blend` contiene le collezioni modificabili per EGA6, EBL, EGF, EGF-PUSH, Innova SLI, Aermec FCZ P/PO, Innova OSMO SL e un esempio di plenum a tre stacchi. Le collezioni occupano la stessa origine: isolare quella desiderata nella vista di Blender. I file `.glb` esportati per il visualizzatore sono in `public/models/hvac`.

Le revisioni successive, più dettagliate, sono separate per evitare di sovrascrivere il progetto originario: `ecoclima-grilles-realistic.blend`, `edls-realistic.blend`, `edfl-realistic.blend`, `edls-plenum-laterale.blend`, `plenum-multi-realistic.blend`, `innova-sli-core-realistic.blend`, `innova-sli-panel-realistic.blend`, `innova-osmo-sl-realistic.blend`, `aermec-fcz-realistic.blend` e `gree-gud71-realistic.blend`. Gli script corrispondenti sono in `scripts/blender/`; rigenerarli sovrascrive le rispettive esportazioni e i rispettivi file Blender, quindi conservare una copia prima di modificare i sorgenti a mano.

I modelli sono ricostruzioni illustrative dalle schede; non sono disegni costruttivi. Il numero e la posizione degli stacchi dei plenum nel configuratore restano generati dalle dimensioni del progetto. OSMO non è presente nel catalogo corrente e il suo modello non è ancora selezionabile nell'app.

AirLeaf SL e SLS: `innova-airleaf-visible.blend`, generato da `scripts/blender/innova-airleaf-visible.py`. Stufe AMIKA AD e Flexi 7: `stufe-amika-flexi.blend`, generato da `scripts/blender/stoves-first-models.py`. AMIKA PETRA AD: `stufa-amika-petra.blend`, generato da `scripts/blender/amika-petra.py`; ANGELICA EVO e JUNIOR: `stufe-angelica.blend`, generato da `scripts/blender/angelica-evo.py`. Le esportazioni nelle finiture di catalogo sono in `public/models/stoves` e mostrano le stufe spente. Gli altri modelli del catalogo stufe non hanno ancora un modello 3D dedicato.

DAHIANA AD e DANIELA: `stufe-dahiana-daniela.blend`, generato da `scripts/blender/dahiana-daniela.py`. Le finiture sono ricostruite dalle denominazioni e dalle immagini di catalogo, e possono essere corrette nel file Blender.

DEBBY EVO e DEBBY PETRA EVO: `stufe-debby.blend`, generato da `scripts/blender/debby-evo.py`.

KATIA 9 e 11 5.0 EVO: `stufe-katia-evo.blend`, generato da `scripts/blender/katia-evo.py`.

KETTY 5.0: `stufa-ketty-50.blend`, generato da `scripts/blender/ketty-50.py`.

KLAUDIA AD EVO: `stufa-klaudia-ad-evo.blend`, generato da `scripts/blender/klaudia-ad-evo.py`.

LUCIA 16, LUISELLA 5.0 e LUISELLA 5.0 MAXI: `stufe-lucia-luisella.blend`, generato da `scripts/blender/lucia-luisella.py`.

MARIELLA AD: `stufa-mariella-ad.blend`, generato da `scripts/blender/mariella-ad.py` a partire dalla geometria ANGELICA, con proporzioni adeguate al modello.

NORIS EVO, NORIS LUX EVO e PEGGY: `stufe-noris-peggy.blend`, generato da `scripts/blender/noris-peggy.py`.

SABRY AD: `stufa-sabry-ad.blend`, generato da `scripts/blender/sabry-ad.py` a partire dalla geometria ANGELICA, con proporzioni adeguate al modello.

TEODORA EVO: `stufa-teodora-evo.blend`, generato da `scripts/blender/teodora-evo.py`. TEOREMA AD e ANGELICA PLUS EVO: rispettivamente `stufa-teorema-ad.blend` e `stufa-angelica-plus-evo.blend`, generati da `scripts/blender/teorema-angelica-plus.py` a partire dai modelli affini DAHIANA e ANGELICA.

Le versioni Plus di DAHIANA, DANIELA, KLAUDIA, LUCIA e MARIELLA condividono foto e ingombro con i rispettivi modelli già presenti: `scripts/blender/export-varianti-plus.py` riutilizza le relative esportazioni e i relativi file Blender sorgente.

ANNABELLA PLUS e ANNALISA PLUS (Crystal e Gres): `stufe-annabella-annalisa.blend`, generato da `scripts/blender/annabella-annalisa.py`.

MARILENA PLUS e SHARON PLUS: `stufe-marilena-sharon.blend`, generato da `scripts/blender/marilena-sharon.py`. NORIS PLUS e TEOREMA PLUS condividono la geometria delle corrispondenti versioni standard e vengono esportate da `scripts/blender/export-varianti-plus.py`.

SOUVENIR PLUS LUX, PETRA e STEEL: `stufe-souvenir-plus.blend`, generato da `scripts/blender/souvenir-plus.py`.

TERRY PLUS e COSTANZA IDRO 5.0: `stufe-terry-costanza.blend`, generato da `scripts/blender/terry-costanza.py`.

EVELYNE IDRO EVO e FLORIANA IDRO Crystal/Gres: `stufe-evelyne-floriana.blend`, generato da `scripts/blender/evelyne-floriana.py`.

GUENDA IDRO EVO: `stufa-guenda-idro-evo.blend`, generato da `scripts/blender/guenda-idro-evo.py`, con proporzioni e griglia proprie.

ISIDE IDRO e ISIDORA IDRO H16/H20/H23: `stufe-iside-isidora.blend`, generato da `scripts/blender/iside-isidora.py`.

MARINA IDRO H11/H13 e MIRIANA IDRO H16/H20/H23: i singoli file `stufa-nordica-*.blend` sono generati da `scripts/blender/marina-miriana.py`, con proporzioni e pannelli distinti.

RAFFAELLA IDRO H15/H18, ROSANNA IDRO e VIRNA IDRO: singoli file `stufa-nordica-*.blend`, generati da `scripts/blender/raffaella-rosanna-virna.py`.

Ravelli FLEXI 9: `stufa-ravelli-flexi-9.blend`, generato da `scripts/blender/ravelli-flexi-9.py` dalla sagoma FLEXI 7.

Ravelli ARIA, ALFA S, WHISPER 7, ELETTRA, CIRCULAR 7 e 9: `stufe-ravelli-primi.blend`, generato da `scripts/blender/ravelli-primi-modelli.py`. Per WHISPER 7 il modello usa 504 × 1040 × 561 mm dal manuale Ravelli: i dati tecnici importati nel catalogo riportano erroneamente valori dieci volte superiori.

Ravelli HOOP 7/9, MILD ed EASY 7/9: `stufe-ravelli-hoop-mild-easy.blend`, generato da `scripts/blender/ravelli-hoop-mild-easy.py`. Le EASY usano 525 × 1030 × 480 mm, come da scheda Ravelli; anche qui i dati tecnici del catalogo sono dieci volte maggiori.

Ravelli HRV 160 DESIGN, 100/140 TOUCH, 160 TOUCH STEEL, 200, 250 e 180 SILHOUETTE: `stufe-ravelli-hrv.blend`, generato da `scripts/blender/ravelli-hrv.py`.

Ravelli DUAL 7/9 e S70/S90: singoli `stufa-ravelli-*.blend`, generati da `scripts/blender/ravelli-dual-s.py`. DUAL usa le dimensioni del manuale Ravelli; quelle importate nel catalogo sono dieci volte maggiori.

Ravelli R70, RV80/100/110/120 TOUCH e SPHERE V: `stufe-ravelli-r-rv.blend`, generato da `scripts/blender/ravelli-r-rv.py`.

Ravelli BLOCK 7/9 e LUNA: `stufe-ravelli-block-luna.blend`. VITTORIA V e EASY 12/C: singoli `stufa-ravelli-*.blend`, generati da `scripts/blender/ravelli-varianti-easy-vittoria.py`, che esporta anche SPHERE C dalla stessa sagoma di SPHERE V. EASY 12/C usa le dimensioni dei manuali Ravelli, invece dei valori dieci volte maggiori nel catalogo locale.

Ravelli LINE, STILO e OLIVIA STEEL: `stufe-ravelli-slim.blend`, generato da `scripts/blender/ravelli-slim.py`. LINE usa le dimensioni del manuale Ravelli, non i valori dieci volte maggiori nel catalogo.

Ravelli RC 120 TOUCH STEEL, RC 70, SC 90 e VITTORIA C: singoli `stufa-ravelli-*.blend`, generati da `scripts/blender/ravelli-varianti-canalizzate.py` dalle sagome affini.

Ravelli HRV STYLE, COUNTRY, GLOBE, SILHOUETTE, TOUCH e PLUS successive: singoli `stufa-ravelli-*.blend`, generati da `scripts/blender/ravelli-hrv-varianti.py`.

Ravelli a legna DAFNE, MINERVA, CALLIOPE, THOR ed EFESTO: `stufe-ravelli-legna.blend`, generato da `scripts/blender/ravelli-legna.py`.

La Nordica LARISSA, ASIA, AURELIA EOS, BRIGITTA e CANDY: `stufe-nordica-legna-inizio.blend`, generato da `scripts/blender/nordica-legna-inizio.py`.

La Nordica CONCITA, DANTE, EMI ed EMILIANA: `stufe-nordica-concita-dante.blend`, generato da `scripts/blender/nordica-concita-dante.py`.

La Nordica ESTER, FEDORA e GEMMA, comprese le versioni con forno: `stufe-nordica-ester-fedora-gemma.blend`, generato da `scripts/blender/nordica-ester-fedora-gemma.py`.

La Nordica GIULIETTA, ISETTA e ISOTTA, comprese le versioni con forno: `stufe-nordica-ghisa-classica.blend`, generato da `scripts/blender/nordica-ghisa-classica.py`. La ISETTA CC non ha finiture elencate nel catalogo; l'anteprima usa la ghisa antracite mostrata nella foto.

La Nordica JENNIFER, LAVINIA, LIU, MARLENA e NOVA FORNO: `stufe-nordica-jennifer-liu-nova.blend`, generato da `scripts/blender/nordica-jennifer-liu-nova.py`.

La Nordica ROSSELLA e TERMOROSSELLA, incluse le versioni forno e pietra: singoli `stufa-nordica-*.blend`, generati da `scripts/blender/nordica-rossella.py` da geometrie affini.

La Nordica SUPER JUNIOR, TEA, SIERRA e TERMOROSA: `stufe-nordica-ultimi.blend`, generato da `scripts/blender/nordica-ultimi.py`.

La botola animata in app usa gli oggetti `Cornice_mobile` e `Pannello_forato`; `Cornice_fissa` e `Filtro` rimangono fissi. Mantenere questi nomi se si riesporta `egf-push-realistic.glb`. Il corpo verde del plenum EDLS segue l'indicazione diretta del committente; il plenum zincato è rappresentato in grigio metallico.

Riferimenti: [EGA6](https://www.ecoclima.com/catalogo-generale/diffusione/griglie/ega6-griglie-di-ripresa-in-alluminio-passo-25-con-filtro), [EGF-PUSH](https://www.ecoclima.com/catalogo-generale/diffusione/griglie/egf-push-griglia-forellinata-con-filtro), [Innova SLI](https://www.innovaenergie.com/prodotti/fancoils/airleaf/airleaf-sli/), [Innova OSMO](https://www.innova.it/prodotti/fancoils/osmo/) e immagine ufficiale Aermec FCZ P/PO nel catalogo locale.

Global VIP e OSCAR: `scripts/blender/global-radiators.py -- vip|oscar` esporta un solo elemento (`public/models/hvac/global-*-section.glb`) che l'app ripete e allunga all'altezza di catalogo; valvole e sfiato sono disegnate dall'app (`RadiatorHardware.tsx`), nel `.blend` compaiono solo come riferimento. Tenere allineate le zone fisse dello script e `src/domain/catalogs/global-sections.ts`.

Diffusori Ecoclima a soffitto, un modello per famiglia: `ecoclima-diffusers.blend`, generato da `scripts/blender/ecoclima-diffusers.py`. Le quote vengono da `originalDimensionsMm` del catalogo (ad esempio EDRC: faccia Ø393, altezza 205) e la forma dalle foto del produttore in `public/catalog/`. Esporta in `public/models/ecoclima/diffusers`: `edrc-round`/`edrc-square` (EDRC, EDRCS, EDRCS THERM e PQR), `edrf-round`/`edrf-square` (EDRF, EDRFB, EDRFQ, EDRFQB), `edra-round`/`edra-square`, `edcs-round`/`edcs-square` (le varianti PQ), `edqv-square` (EDQV), `edu-round` (EDU e varianti), `ede-square`/`ede2-square` (EDE1, EDE1R, EDE2, EDE2S, EDE5, EDE-FB, EDE2R), valvole `valve-round` (EVVMC, EVVRC), `valve-abs` (EVPMC), `valve-inox` (EAM-VRFN), `edcf-round`, `edcc-round`, `edqf-square`, `edqc-square`, `edea-round`, `edqm-square`/`edqm-round` (multi-ugello), `edfds-round`, `edsc-round`/`edsc-square` ed `eadd-square`. La mappa famiglia → modello è in `src/configurator/viewer3d/ecoclima-diffuser-models.ts`.

Griglie rettangolari: `ecoclima-grilles.blend`, generato da `scripts/blender/ecoclima-grilles.py` (`blender -b -P scripts/blender/ecoclima-grilles.py`, circa 2 minuti), un GLB per ogni variante del catalogo in `public/models/ecoclima/<famiglia>/<id variante>.glb` (misura di facciata come la disegna l'app; EDLH/EDLSV sono lunghi 1000 mm e scalati in X; coprono anche EAG-AL ed EAG-INOX), in scala reale: passo di alette, barre, lamelle, maglia e fori è quello vero, quindi il numero di elementi segue la misura. Sei archetipi: doppia deflessione (EBA alluminio, EBV acciaio zincato, EBIA passo 40, EBCV con fianchi curvi), barre (EBLF/EBLR/EBLS/EBL3), lamelle inclinate (EGA*, EGZ*, ETA, EGS, EAG/EAL, EDC1-6), maglia quadra (EGQ*), lamiera forata con texture (EGFR/EGFF/EAGF/EGA-ONE/EGFC), ugelli (EDMP-P/-C, EDMF-S) e pedonabili (EBP/EBP-T). Il .blend conserva una misura per famiglia. Cornici, spessori e profondità non pubblicati dal produttore sono ricostruiti dalle foto. Restano sul modello dedicato precedente EBL/EGF/EGF-PUSH/EGFR-PUSH/EGA6; resta sul vecchio box solo EGE (il catalogo non ha alcuna misura).

Entrambi gli script si eseguono con `blender -b -P scripts/blender/<script>.py` (l'esportazione glTF non funziona dentro l'MCP). La mappa famiglia → modello è in `src/configurator/viewer3d/ecoclima-diffuser-models.ts`; le famiglie non elencate restano disegnate in modo procedurale da `terminal-detail.ts`. Materiali: `Profile*` prende la finitura scelta; `Interno`, `Collare` e `Rete` restano fissi.

Stufe: dopo aver rigenerato i GLB con i generatori (`scripts/blender/<famiglia>.py`) va rilanciato `blender -b --python-exit-code 1 --python scripts/blender/finish-stoves.py` (accetta una regex sul nome file dopo `--`; salta i file già rifiniti, circa 4 secondi a file). Il passo dà al vetro UV frontali per la fiamma (`public/models/flame.png`, generata da `scripts/blender/flame-texture.py`, accesa dall'app sui materiali «Vetro…») e cuoce l'occlusione ambientale in una texture JPEG sulla seconda UV (`occlusionTexture`, `texCoord` 1). I `.blend` in questa cartella non contengono la rifinitura: fa fede il GLB.
