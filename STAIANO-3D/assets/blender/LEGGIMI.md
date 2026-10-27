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

La botola animata in app usa gli oggetti `Cornice_mobile` e `Pannello_forato`; `Cornice_fissa` e `Filtro` rimangono fissi. Mantenere questi nomi se si riesporta `egf-push-realistic.glb`. Il corpo verde del plenum EDLS segue l'indicazione diretta del committente; il plenum zincato è rappresentato in grigio metallico.

Riferimenti: [EGA6](https://www.ecoclima.com/catalogo-generale/diffusione/griglie/ega6-griglie-di-ripresa-in-alluminio-passo-25-con-filtro), [EGF-PUSH](https://www.ecoclima.com/catalogo-generale/diffusione/griglie/egf-push-griglia-forellinata-con-filtro), [Innova SLI](https://www.innovaenergie.com/prodotti/fancoils/airleaf/airleaf-sli/), [Innova OSMO](https://www.innova.it/prodotti/fancoils/osmo/) e immagine ufficiale Aermec FCZ P/PO nel catalogo locale.

Global VIP e OSCAR: `scripts/blender/global-radiators.py -- vip|oscar` esporta un solo elemento (`public/models/hvac/global-*-section.glb`) che l'app ripete e allunga all'altezza di catalogo; valvole e sfiato sono disegnate dall'app (`RadiatorHardware.tsx`), nel `.blend` compaiono solo come riferimento. Tenere allineate le zone fisse dello script e `src/domain/catalogs/global-sections.ts`.
