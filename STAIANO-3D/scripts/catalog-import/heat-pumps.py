"""Offline normalization of reviewed official heat-pump tables; hashes pin sources.

Run with the bundled Python (pypdf). Changed documents require review of the
source rows before changing their expected hash. No interpolation of capacities.
"""
from pathlib import Path
import hashlib
import json
import re
from datetime import datetime, timezone
from pypdf import PdfReader
import pdfplumber

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "catalog-data/sources/heat-pumps"
DOCS = {
    "chaffoteaux": ("https://www.chaffoteaux.it/themes/file_product/pdf40475-20220610115628.pdf", "50dd1e10b157906c3443ab9678d1d0960a91f50189f123e0aa16a674575a0bf9", "Scheda ARIANEXT PLUS M LINK R32 2022"),
    "chaffoteaux-arianext-lite": ("https://www.chaffoteaux.it/themes/file_product/pdf49969-20220517110607.pdf", "c83e85bb612e57d95c60f3f07c7a82b50cf3fc7a523a154b5e1a55bcb9be24ca", "Scheda ARIANEXT LITE M LINK R32 2022"),
    "chaffoteaux-arianext-plus-s": ("https://www.chaffoteaux.it/themes/file_product/pdf37135-20221222153632.pdf", "cefeae37acfcd452edfdd686ec16bb62f037fc5fb5d3b94d2fc8f3d80b170cf7", "Scheda ARIANEXT PLUS S LINK R32 2022"),
    "chaffoteaux-arianext-compact-m": ("https://www.chaffoteaux.it/themes/file_product/pdf3518-20220517110518.pdf", "416d80557a8c4f63c14d4d5cd5aa4af7e988af59da70b45df67bede17de69f57", "Scheda ARIANEXT COMPACT M LINK R32 2022"),
    "chaffoteaux-arianext-compact-s": ("https://www.chaffoteaux.it/themes/file_product/pdf47341-20221222151931.pdf", "676b0feb51aec486a6fa085216c5d238f176202f2c3d977543c25ad6488cf34c", "Scheda ARIANEXT COMPACT S LINK R32 2022"),
    "chaffoteaux-arianext-m-flex-in": ("https://www.chaffoteaux.it/themes/file_product/pdf33208-20221111123536.pdf", "9444936c54bc76a32bafb91ddfe8fef9f5ba8bd0a63da8d1095f48e6f6c17ac0", "Scheda ARIANEXT M FLEX IN LINK R32 2022"),
    "chaffoteaux-arianext-m-hybrid": ("https://www.chaffoteaux.it/themes/file_product/pdf1541-20221115123231.pdf", "cf063867499f14d4c253fb134b94ea6f1208625f1dfd99f6560341cb1accad3d", "Scheda ARIANEXT M HYBRID LINK R32 2022"),
    "chaffoteaux-arianext-m-hybrid-universal": ("https://www.chaffoteaux.it/themes/file_product/pdf75652-20221115124105.pdf", "c5af124205c78dcd4c6369541ec0066f5284719f71d2aa9cd7edbdebc4497d4d", "Scheda ARIANEXT M HYBRID UNIVERSAL LINK R32 2022"),
    "chaffoteaux-pigma-advance-hybrid-flex-in": ("https://www.chaffoteaux.it/themes/file_product/pdf48839-20221115120927.pdf", "73f9a0c1048584ab11d9b972e0a51e8267f27ee3a90acadae28f95225ed94c15", "Scheda PIGMA ADVANCE HYBRID FLEX IN LINK R32 2022"),
    "gree-versati-v": ("https://service.argoonline.it/area_riservata/WebDocTec/Documents/SCP/GREE_Brochure_VersatiV_2025.pdf", "d7d4778eea36e2bd4287db4a42a25ffa0ea67baae978c685bc97d7681b805a2b", "Brochure VERSATI V 2025"),
    "gree-versati-iii": ("https://service.argoonline.it/area_riservata/WebDocTec/Documents/SER/Service%20Manual%20for%20VERSATI%20R32%20SPLIT.pdf", "781db69b864400db2204e825486109fd0eb3d02454cc45ce957f28dffb620e75", "Service Manual VERSATI III Split · technical data"),
    "gree-versati-iii-all-in-one": ("https://service.argoonline.it/area_riservata/WebDocTec/Documents/SER/service%20manual%20for%20versati%20split%20all%20in%20one.pdf", "5451e894bd01085fc7a4a20ccac9110d37ff6e3db698939b3aef802c79135760", "Service Manual VERSATI III All In One · technical data"),
    "daikin-residential-2025": ("https://www.daikin.it/content/dam/DACI-Internet/Download/catalogo-generale-2025/202501%20Catalogo%20Residenziale%2020250429.pdf", "a4414ccfb82ba4e6f29c6d456c53ffb7ab2dcb26a48f78be9b9f1fe815d4129a", "Catalogo Residenziale 2025"),
}
# LG THERMA V monoblock sheets published by the Climanext agency (LG leaflet, header "SCHEDA TECNICA [yyyy_mm]"); name -> (url, sha256, listino code).
LG_DOCS = {
    "lg-therma-v-monoblocco-s-ii-hm051mrs": ("https://www.climanext.net/wp-content/uploads/2026/09/lg-scheda-therma-v-monoblocco-s-ii-hm051mrs.pdf", "cfcb88ca669aa1f21d5025fe2fdb1bf1fb4c171c4413f2deef06d0d33ae40f01", 'HM051MRS.UA40'),
    "lg-therma-v-monoblocco-s-ii-hm071mrs": ("https://www.climanext.net/wp-content/uploads/2026/09/lg-scheda-therma-v-monoblocco-s-ii-hm071mrs.pdf", "32bc5f04c32dce7d262860a18444f189d46d399793b8db38fe80e8adcbcc35d5", 'HM071MRS.UA40'),
    "lg-therma-v-monoblocco-s-ii-hm091mrs": ("https://www.climanext.net/wp-content/uploads/2026/09/lg-scheda-therma-v-monoblocco-s-ii-hm091mrs.pdf", "6fab5094a7f5d64e9357d44bc64c88486ce79edfcb9014bd5fbf6a1892793f29", 'HM091MRS.UA40'),
    "lg-therma-v-r290-hm093hf": ("https://www.climanext.net/wp-content/uploads/2026/09/lg-scheda-therma-v-r290-hm093hf.pdf", "ccd950acfe774acb72d8ae08b2529de1212075f67e56d4929b2a9d9ece7aa8e5", 'HM093HF.UB40'),
    "lg-therma-v-r290-hm121hf": ("https://www.climanext.net/wp-content/uploads/2026/09/lg-scheda-therma-v-r290-hm121hf.pdf", "86c1c150dfd33e5252d00e11d0bfc602d2d91de196c246bd6e1ba48ec8224c3a", 'HM121HF.UB60'),
    "lg-therma-v-monoblocco-s-ii-hm121mrs": ("https://www.climanext.net/wp-content/uploads/2026/09/lg-scheda-therma-v-monoblocco-s-ii-hm121mrs.pdf", "000c4e7b85eda93a161c9c610e927a946755a1c36776f10c1e282ed276f42fcd", 'HM121MRS.UB40'),
    "lg-therma-v-monoblocco-s-ii-hm123mrs": ("https://www.climanext.net/wp-content/uploads/2026/09/lg-scheda-therma-v-monoblocco-s-ii-hm123mrs.pdf", "f73ff4cc059887f2faee1ed1b4b9c53386ec401aea4a3d14191bd9fda87da89b", 'HM123MRS.UB40'),
    "lg-therma-v-r290-hm141hf": ("https://www.climanext.net/wp-content/uploads/2026/09/lg-scheda-therma-v-r290-hm141hf.pdf", "2efe9742af7dcbd0d5f6e2d4f581631e92b13e3abdfc56423058fbd0dd669f13", 'HM141HF.UB60'),
    "lg-therma-v-monoblocco-s-ii-hm141mrs": ("https://www.climanext.net/wp-content/uploads/2026/09/lg-scheda-therma-v-monoblocco-s-ii-hm141mrs.pdf", "1902ec9ddb84c1b7551d507a05379cb2be5d264e370a8b8ee0b8ddabdf84dd53", 'HM141MRS.UB40'),
    "lg-therma-v-monoblocco-s-ii-hm143mrs": ("https://www.climanext.net/wp-content/uploads/2026/09/lg-scheda-therma-v-monoblocco-s-ii-hm143mrs.pdf", "b9ef534bbfe5b21bc4295b4232a9379ca4d6effd69124422a7ae6a5c67c99d6b", 'HM143MRS.UB40'),
    "lg-therma-v-r290-hm161hf": ("https://www.climanext.net/wp-content/uploads/2026/09/lg-scheda-therma-v-r290-hm161hf.pdf", "941f9541e8da12ec7970a74557eb6cedf9d74d57567c99aa1fde9342639133f4", 'HM161HF.UB60'),
    "lg-therma-v-monoblocco-s-ii-hm161mrs": ("https://www.climanext.net/wp-content/uploads/2026/09/lg-scheda-therma-v-monoblocco-s-ii-hm161mrs.pdf", "0d5e2437f61a219d17448c17c97d195e83e1bf24182eb68368722e6dc6e206ce", 'HM161MRS.UB40'),
    "lg-therma-v-monoblocco-s-ii-hm163mrs": ("https://www.climanext.net/wp-content/uploads/2026/09/lg-scheda-therma-v-monoblocco-s-ii-hm163mrs.pdf", "616e0b11bb468a4206fae54f020288b56c2637815b425ca7273b0a01d00561e9", 'HM163MRS.UB40'),
    "lg-therma-v-monoblocco-g-hm513mr": ("https://www.climanext.net/wp-content/uploads/2026/09/lg-scheda-therma-v-monoblocco-g-hm513mr.pdf", "919cf82b0a6fab23ff7624fd8c4411b4c0baaf60f6ca0f8dc92bf1a7c812be96", 'HM513MR.UXC0'),
}
def lg_revision(name):
    with pdfplumber.open(SOURCE / f"{name}.pdf") as pdf:
        match = re.search(r"SCHEDA TECNICA \[(\d{4}_\d{2})\]", pdf.pages[0].extract_text())
    assert match, f"{name}: sheet revision not found"
    return f"Scheda tecnica LG [{match[1]}]"
DOCS.update({name: (url, digest, lg_revision(name)) for name, (url, digest, _) in LG_DOCS.items()})
# The residential catalogue is archived once under sources/hvac (ducted and split Daikin cite it too).
DOC_PATHS = {"daikin-residential-2025": ROOT / "catalog-data/sources/hvac/daikin-residential-2025.pdf"}

def doc_file(name):
    return DOC_PATHS.get(name, SOURCE / f"{name}.pdf")

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

for name, (_, expected, _) in DOCS.items():
    if sha(doc_file(name)) != expected:
        raise ValueError(f"Source changed: review {name}")

manifest_path = SOURCE / "manifest.json"
previous_manifest = {m["name"]: m for m in json.loads(manifest_path.read_text(encoding="utf8"))} if manifest_path.exists() else {}
retrieved = {name: previous_manifest[name]["retrievedAt"] if previous_manifest.get(name, {}).get("timestampBasis") == "file-acquired-at" else datetime.fromtimestamp(doc_file(name).stat().st_mtime, timezone.utc).isoformat() for name in DOCS}

def source(name, manufacturer, page):
    url, digest, revision = DOCS[name]
    return dict(manufacturer=manufacturer, sourceUrl=url, sourceType="pdf", sha256=digest,
                documentRevision=revision, retrievedAt=retrieved[name], importedAt=retrieved[name], page=page)

def photo(name, url, caption):
    path = ROOT / "public/catalog-assets/heat-pumps" / name
    return dict(localPath=f"/catalog-assets/heat-pumps/{name}", sourceUrl=url, sha256=sha(path), caption=caption)

def point(label, heat, cold, cop, eer, heat_water=35, heat_air=7):
    return dict(label=label, heatingW=round(heat*1000), coolingW=round(cold*1000), cop=cop, eer=eer,
                heatingWaterSupplyC=heat_water, coolingWaterSupplyC=7, heatingOutdoorC=heat_air, coolingOutdoorC=35,
                heatingConditions=f"EN 14511 · aria esterna {heat_air} °C · acqua mandata/ritorno {heat_water}/{heat_water-5} °C",
                coolingConditions="EN 14511 · aria esterna 35 °C · acqua mandata/ritorno 7/12 °C")

products = []
chaff_photo = photo("chaffoteaux-arianext-plus.png", "https://www.chaffoteaux.it/themes/img/produits_pers/png39273-20220426155452.png", "Foto ufficiale di gamma ARIANEXT PLUS M LINK R32, con modulo interno; il 3D rappresenta l’unità esterna.")
# Reviewed page 4 exact nominal rows; page 3 external dimension drawings.
for size, height, heat35, heat45, heatminus7, cold, cop35, cop45, copminus7, eer in [
    (35, 756, 3.5, 3.0, 3.51, 3.5, 5.1, 3.74, 3.1, 3.4),
    (50, 756, 5.0, 4.05, 5.0, 5.0, 5.0, 3.65, 2.9, 2.85),
    (80, 1106, 8.0, 6.0, 7.41, 7.0, 4.8, 3.7, 3.0, 3.1),
]:
    products.append(dict(id=f"chaffoteaux-arianext-plus-{size}-m-r32", manufacturer="Chaffoteaux", family="ARIANEXT PLUS M LINK R32", model=f"ARIANEXT PLUS {size} M LINK R32",
        widthMm=1016, heightMm=height, depthMm=383, dimensionNote="Ingombro unità esterna L×H×P da disegno pag. 3; distanze di servizio da verificare nel manuale. Modulo interno previsto dal sistema, da progettare separatamente.",
        features=["Monoblocco inverter R32", "Expert HD e Wi-Fi di serie", "Gestione ChaffoLink", "ACS con bollitore opzionale"], productPhoto=chaff_photo, sourceMetadata=source("chaffoteaux", "Chaffoteaux", 4),
        operatingPoints=[point("Caldo A7/W35 · freddo A35/W7", heat35, cold, cop35, eer), point("Caldo A7/W45 · freddo A35/W7", heat45, cold, cop45, eer, 45), point("Caldo A−7/W35 · freddo A35/W7", heatminus7, cold, copminus7, eer, 35, -7)]))

lite_photo = photo("chaffoteaux-arianext-lite.png", "https://www.chaffoteaux.it/themes/img/produits_pers/png55595-20261007161226.png", "Foto ufficiale di gamma ARIANEXT LITE M LINK R32, con Light Box e Expert HD; il 3D rappresenta l’unità esterna.")
# Reviewed page 4 exact nominal rows, not rounded page 2 summaries; dimensions on page 3.
for size, phase, code, height, heat35, heat45, heatminus7, cold, cop35, cop45, copminus7, eer in [
    (35, "M", 3302018, 756, 3.5, 3.0, 3.51, 3.5, 5.1, 3.74, 3.1, 3.4),
    (50, "M", 3302019, 756, 5.0, 4.05, 5.0, 5.0, 5.0, 3.65, 2.9, 2.85),
    (80, "M", 3302020, 1106, 8.0, 6.0, 7.41, 7.0, 4.8, 3.7, 3.0, 3.1),
    (80, "M-T", 3302021, 1106, 8.0, 6.0, 7.41, 7.0, 4.8, 3.7, 3.0, 3.1),
    (120, "M", 3302022, 1506, 12.0, 8.2, 9.51, 9.05, 4.9, 4.1, 3.2, 3.15),
    (120, "M-T", 3302023, 1506, 12.0, 8.2, 9.51, 9.05, 4.9, 4.1, 3.2, 3.15),
    (150, "M", 3302024, 1506, 15.0, 9.9, 11.0, 11.0, 4.7, 4.0, 3.1, 2.93),
    (150, "M-T", 3302025, 1506, 15.0, 9.9, 11.0, 11.0, 4.7, 4.0, 3.1, 2.93),
]:
    supply = "Monofase 230 V / 50 Hz" if phase == "M" else "Trifase 400 V / 50 Hz"
    products.append(dict(id=f"chaffoteaux-arianext-lite-{size}-{phase.lower()}-r32", manufacturer="Chaffoteaux", family="ARIANEXT LITE M LINK R32", model=f"ARIANEXT LITE {size} {phase} LINK R32",
        widthMm=1016, heightMm=height, depthMm=383, dimensionNote="Ingombro unità esterna L×H×P da disegno pag. 3, profondità totale 383 mm; distanze di servizio da verificare nel manuale. Light Box ed Expert HD inclusi nel sistema.",
        features=["Monoblocco inverter R32", supply, f"Codice sistema {code}", "Expert HD e Wi-Fi di serie", "Gestione ChaffoLink", "Light Box IPX5", "Puffer e resistenza integrativa opzionali", "ACS con bollitore e kit opzionali"], productPhoto=lite_photo, sourceMetadata=source("chaffoteaux-arianext-lite", "Chaffoteaux", 4),
        operatingPoints=[point("Caldo A7/W35 · freddo A35/W7", heat35, cold, cop35, eer), point("Caldo A7/W45 · freddo A35/W7", heat45, cold, cop45, eer, 45), point("Caldo A−7/W35 · freddo A35/W7", heatminus7, cold, copminus7, eer, 35, -7)]))

# ARIANEXT range (listino Chaffoteaux 05/2026): every M/S/hybrid/FLEX IN system sold, not only PLUS M and LITE.
# Capacities come from the "caratteristiche tecniche" table of each official sheet; the outdoor-unit drawing
# gives L×H×P (the PDF text reads the heights reversed: 657 = 756, 6011 = 1106, 6051 = 1506 mm).
# Nominal Min/Nom/Max rows are parsed from the PDF, never copied by hand.
CHAFF_CODES = """
3301997|ARIANEXT PLUS 80 M-T LINK R32
3301998|ARIANEXT PLUS 120 M LINK R32
3301999|ARIANEXT PLUS 120 M-T LINK R32
3302000|ARIANEXT PLUS 150 M LINK R32
3302001|ARIANEXT PLUS 150 M-T LINK R32
3302002|ARIANEXT COMPACT 35 M LINK R32
3302003|ARIANEXT COMPACT 35 M 2Z LINK R32
3302004|ARIANEXT COMPACT 50 M LINK R32
3302005|ARIANEXT COMPACT 50 M 2Z LINK R32
3302006|ARIANEXT COMPACT 80 M LINK R32
3302007|ARIANEXT COMPACT 80 M 2Z LINK R32
3302008|ARIANEXT COMPACT 80 M-T LINK R32
3302009|ARIANEXT COMPACT 80 M-T 2Z LINK R32
3302010|ARIANEXT COMPACT 120 M LINK R32
3302011|ARIANEXT COMPACT 120 M 2Z LINK R32
3302012|ARIANEXT COMPACT 120 M-T LINK R32
3302013|ARIANEXT COMPACT 120 M-T 2Z LINK R32
3302014|ARIANEXT COMPACT 150 M LINK R32
3302015|ARIANEXT COMPACT 150 M 2Z LINK R32
3302016|ARIANEXT COMPACT 150 M-T LINK R32
3302017|ARIANEXT COMPACT 150 M-T 2Z LINK R32
3302034|ARIANEXT PLUS 35 S LINK R32
3302035|ARIANEXT PLUS 50 S LINK R32
3302036|ARIANEXT PLUS 80 S LINK R32
3302037|ARIANEXT PLUS 80 S-T LINK R32
3302038|ARIANEXT PLUS 120 S LINK R32
3302039|ARIANEXT PLUS 120 S-T LINK R32
3302040|ARIANEXT PLUS 150 S LINK R32
3302041|ARIANEXT PLUS 150 S-T LINK R32
3302042|ARIANEXT COMPACT 35 S LINK R32
3302043|ARIANEXT COMPACT 35 S 2Z LINK R32
3302044|ARIANEXT COMPACT 50 S LINK R32
3302045|ARIANEXT COMPACT 50 S 2Z LINK R32
3302046|ARIANEXT COMPACT 80 S LINK R32
3302047|ARIANEXT COMPACT 80 S 2Z LINK R32
3302048|ARIANEXT COMPACT 80 S-T LINK R32
3302049|ARIANEXT COMPACT 80 S-T 2Z LINK R32
3302050|ARIANEXT COMPACT 120 S LINK R32
3302051|ARIANEXT COMPACT 120 S 2Z LINK R32
3302052|ARIANEXT COMPACT 120 S-T LINK R32
3302053|ARIANEXT COMPACT 120 S-T 2Z LINK R32
3302054|ARIANEXT COMPACT 150 S LINK R32
3302055|ARIANEXT COMPACT 150 S 2Z LINK R32
3302056|ARIANEXT COMPACT 150 S-T LINK R32
3302057|ARIANEXT COMPACT 150 S-T 2Z LINK R32
3302277|ARIANEXT M FLEX IN 50 LINK R32
3302278|ARIANEXT M FLEX IN 80 LINK R32
3302279|ARIANEXT M FLEX IN 80 T LINK R32
3302280|ARIANEXT M FLEX IN 120 LINK R32
3302281|ARIANEXT M FLEX IN 120 T LINK R32
3302282|ARIANEXT M FLEX IN 150 LINK R32
3302283|ARIANEXT M FLEX IN 150 T LINK R32
3630236|ARIANEXT 80 M EXT R32
3630237|ARIANEXT 80 M-T EXT R32
3630238|ARIANEXT 120 M EXT R32
3630239|ARIANEXT 120 M-T EXT R32
3630240|ARIANEXT 150 M EXT R32
3630241|ARIANEXT 150 M-T EXT R32
3314143|PIGMA ADVANCE HYBRID FLEX IN 25/35 LINK R32
3314144|PIGMA ADVANCE HYBRID FLEX IN 25/50 LINK R32
3314145|PIGMA ADVANCE HYBRID FLEX IN 25/80 LINK R32
3314146|PIGMA ADVANCE HYBRID FLEX IN 25/80 T LINK R32
3314147|PIGMA ADVANCE HYBRID FLEX IN 25/120 LINK R32
3314148|PIGMA ADVANCE HYBRID FLEX IN 25/120 T LINK R32
3314149|PIGMA ADVANCE HYBRID FLEX IN 25/150 LINK R32
3314150|PIGMA ADVANCE HYBRID FLEX IN 25/150 T LINK R32
3314155|ARIANEXT M HYBRID 35 LINK R32
3314156|ARIANEXT M HYBRID 50 LINK R32
3314157|ARIANEXT M HYBRID 80 LINK R32
3314158|ARIANEXT M HYBRID 80 T LINK R32
3314159|ARIANEXT M HYBRID 120 LINK R32
3314160|ARIANEXT M HYBRID 120 T LINK R32
3314161|ARIANEXT M HYBRID 150 LINK R32
3314162|ARIANEXT M HYBRID 150 T LINK R32
3314163|ARIANEXT M HYBRID UNIVERSAL 35 LINK R32
3314164|ARIANEXT M HYBRID UNIVERSAL 50 LINK R32
3314165|ARIANEXT M HYBRID UNIVERSAL 80 LINK R32
3314166|ARIANEXT M HYBRID UNIVERSAL 80 T LINK R32
3314167|ARIANEXT M HYBRID UNIVERSAL 120 LINK R32
3314168|ARIANEXT M HYBRID UNIVERSAL 120 T LINK R32
3314169|ARIANEXT M HYBRID UNIVERSAL 150 LINK R32
3314170|ARIANEXT M HYBRID UNIVERSAL 150 T LINK R32
"""
CHAFF_DOC_NOTES = {
    "chaffoteaux": ("ARIANEXT PLUS M LINK R32", 4, 3, "M", "Modulo interno previsto dal sistema, da progettare separatamente."),
    "chaffoteaux-arianext-plus-s": ("ARIANEXT PLUS S LINK R32", 4, 3, "S", "Modulo interno split previsto dal sistema, da progettare separatamente."),
    "chaffoteaux-arianext-compact-m": ("ARIANEXT COMPACT M LINK R32", 4, 3, "M", "Modulo interno con bollitore 180 l, da progettare separatamente."),
    "chaffoteaux-arianext-compact-s": ("ARIANEXT COMPACT S LINK R32", 4, 3, "S", "Modulo interno con bollitore 180 l, da progettare separatamente."),
    "chaffoteaux-arianext-m-flex-in": ("ARIANEXT M FLEX IN LINK R32", 4, 3, "M", "Unità ad incasso con bollitore 150 l, da progettare separatamente."),
    "chaffoteaux-arianext-m-hybrid": ("ARIANEXT M HYBRID LINK R32", 5, 4, "M", "Modulo ibrido e caldaia Advance abbinata, da progettare separatamente."),
    "chaffoteaux-arianext-m-hybrid-universal": ("ARIANEXT M HYBRID UNIVERSAL LINK R32", 5, 4, "M", "Modulo ibrido e generatore abbinato, da progettare separatamente."),
    "chaffoteaux-pigma-advance-hybrid-flex-in": ("PIGMA ADVANCE HYBRID FLEX IN LINK R32", 5, 4, "M", "Sistema ibrido ad incasso con bollitore 150 l, da progettare separatamente."),
}
CHAFF_COLUMNS = [(35, False), (50, False), (80, False), (80, True), (120, False), (120, True), (150, False), (150, True)]
CHAFF_HEIGHT = {35: 756, 50: 756, 80: 1106, 120: 1506, 150: 1506}
CHAFF_PHOTOS = {
    "plus": chaff_photo,
    "compact": photo("chaffoteaux-arianext-compact.jpg", "https://www.climanext.net/wp-content/uploads/2026/09/chaffoteaux-linea-pompe-di-calore-arianext-compact-ritaglio-400x300.jpg", "Immagine di gamma ARIANEXT COMPACT (modulo interno con bollitore e unità esterna) dal sito Climanext; il 3D rappresenta l’unità esterna."),
    "flex": photo("chaffoteaux-arianext-m-flex-in.jpg", "https://www.climanext.net/wp-content/uploads/2026/09/chaffoteaux-linea-pompe-di-calore-arianext-m-flex-in-ritaglio-400x300.jpg", "Immagine di gamma ARIANEXT M FLEX IN (unità ad incasso e unità esterna) dal sito Climanext; il 3D rappresenta l’unità esterna."),
    "hybrid": photo("chaffoteaux-arianext-m-hybrid.jpg", "https://www.climanext.net/wp-content/uploads/2026/09/chaffoteaux-linea-sistemi-ibridi-arianext-m-hybrid-ritaglio-400x300.jpg", "Immagine di gamma ARIANEXT M HYBRID dal sito Climanext; il 3D rappresenta l’unità esterna."),
    "pigma": photo("chaffoteaux-pigma-advance-hybrid-flex-in.jpg", "https://www.climanext.net/wp-content/uploads/2026/09/chaffoteaux-linea-sistemi-ibridi-pigma-advance-hybrid-flex-in-ritaglio-400x300.jpg", "Immagine di gamma PIGMA ADVANCE HYBRID FLEX IN dal sito Climanext; il 3D rappresenta l’unità esterna."),
}

def page_text(document, page):
    # pdfplumber keeps the Min/Nom/Max cells apart; pypdf glues some of them ("14,374,08").
    with pdfplumber.open(doc_file(document)) as pdf:
        return pdf.pages[page - 1].extract_text()

def chaff_table(document, page):
    text = page_text(document, page)
    cells = lambda pattern: [row.split() for row in re.findall(pattern, text)]
    heat = [[tuple(float(v.replace(",", ".")) for v in cell.split("/")) for cell in row] for row in cells(r"Potenza\s+termica\s+kW\s+([^\n]+)")]
    num = lambda rows: [[float(v.replace(",", ".")) for v in row] for row in rows]
    cop, eer = num(cells(r"COP\s+nom\s+(\d[^\n]*)")), num(cells(r"EER\s+nom\s+(\d[^\n]*)"))
    assert len(heat) == 5 and len(cop) == 3 and len(eer) == 2, f"{document}: capacity table changed"
    return heat, cop, eer

def chaff_spec(name):
    """(document, photo key, size, three-phase, zones, features) from the listino description."""
    m = re.fullmatch(r"ARIANEXT PLUS (\d+) ([MS])(-T)? LINK R32", name)
    if m:
        s = m[2] == "S"
        return ("chaffoteaux-arianext-plus-s" if s else "chaffoteaux"), "plus", int(m[1]), bool(m[3]), 1, (["Predisposta per bollitore sanitario", "Expert HD e Wi-Fi di serie", "Gestione ChaffoLink"] if s else ["Expert HD e Wi-Fi di serie", "Gestione ChaffoLink", "ACS con bollitore opzionale"])
    m = re.fullmatch(r"ARIANEXT COMPACT (\d+) ([MS])(-T)?( 2Z)? LINK R32", name)
    if m:
        return f"chaffoteaux-arianext-compact-{m[2].lower()}", "compact", int(m[1]), bool(m[3]), 2 if m[4] else 1, ["Bollitore integrato 180 l", "Expert HD e Wi-Fi di serie", "Gestione ChaffoLink", "Doppia zona integrata" if m[4] else "Una zona"]
    m = re.fullmatch(r"ARIANEXT M FLEX IN (\d+)( T)? LINK R32", name)
    if m:
        return "chaffoteaux-arianext-m-flex-in", "flex", int(m[1]), bool(m[2]), 1, ["Unità ad incasso con bollitore integrato 150 l", "Expert HD di serie", "Gestione ChaffoLink", "Resistenza elettrica integrativa 2+2 kW"]
    m = re.fullmatch(r"ARIANEXT (\d+) M(-T)? EXT R32", name)
    if m:
        return "chaffoteaux", "plus", int(m[1]), bool(m[2]), 1, ["Unità esterna venduta solo all’interno di un pacchetto ARIANEXT M LINK R32"]
    m = re.fullmatch(r"ARIANEXT M HYBRID (UNIVERSAL )?(\d+)( T)? LINK R32", name)
    if m:
        return ("chaffoteaux-arianext-m-hybrid-universal" if m[1] else "chaffoteaux-arianext-m-hybrid"), "hybrid", int(m[2]), bool(m[3]), 1, (["Predisposta per sistema ibrido con qualsiasi generatore con contatto TA", "Gestione ChaffoLink"] if m[1] else ["Predisposta per sistema ibrido con caldaie serie Advance", "Gestione ChaffoLink"])
    m = re.fullmatch(r"PIGMA ADVANCE HYBRID FLEX IN 25/(\d+)( T)? LINK R32", name)
    if m:
        return "chaffoteaux-pigma-advance-hybrid-flex-in", "pigma", int(m[1]), bool(m[2]), 1, ["Sistema ibrido ad incasso con caldaia PIGMA ADVANCE IN SYSTEM (cod. 3310690) e bollitore 150 l", "Gestione ChaffoLink"]
    raise ValueError(f"Unknown Chaffoteaux listino row: {name}")

chaff_tables = {}
existing_ids = {p["id"] for p in products}
for line in CHAFF_CODES.strip().splitlines():
    code, name = line.split("|")
    document, photo_key, size, three_phase, zones, extra = chaff_spec(name)
    family, table_page, dims_page, kind, indoor = CHAFF_DOC_NOTES[document]
    if name.endswith("EXT R32"):
        family, indoor = "ARIANEXT M EXT R32", "Unità esterna vendibile solo in pacchetto ARIANEXT M LINK R32; modulo interno da progettare separatamente."
    product_id = "chaffoteaux-" + re.sub(r"[^a-z0-9]+", "-", name.replace(" LINK", "").lower()).strip("-")
    if product_id in existing_ids:
        continue
    if document not in chaff_tables:
        heat, cop, eer = chaff_table(document, table_page)
        columns = [c for c in CHAFF_COLUMNS if len(heat[0]) == 8 or c[0] != 35]
        assert len(heat[0]) == len(columns) == len(cop[0]) == len(eer[0]), f"{document}: column count changed"
        dims_text = page_text(document, dims_page)
        assert all(token in dims_text for token in ("1016", "383", "657", "6011", "6051")), f"{document}: outdoor drawing changed"
        chaff_tables[document] = (columns, heat, cop, eer)
    columns, heat, cop, eer = chaff_tables[document]
    column = columns.index((size, three_phase))
    nominal = lambda row: row[column][1] if len(row[column]) == 3 else row[column][0]
    maximum = lambda row: row[column][2] if len(row[column]) == 3 else None
    points = []
    for label, heat_row, cop_row, water, air in [("Caldo A7/W35 · freddo A35/W7", 0, 0, 35, 7), ("Caldo A7/W45 · freddo A35/W7", 2, 2, 45, 7), ("Caldo A−7/W35 · freddo A35/W7", 1, 1, 35, -7)]:
        op = point(label, nominal(heat[heat_row]), nominal(heat[3]), cop[cop_row][column], eer[0][column], water, air)
        if maximum(heat[heat_row]) is not None:
            op["maxHeatingW"], op["maxCoolingW"] = round(maximum(heat[heat_row]) * 1000), round(maximum(heat[3]) * 1000)
        points.append(op)
    supply = "Trifase 400 V / 50 Hz" if three_phase else "Monofase 230 V / 50 Hz"
    products.append(dict(id=product_id, manufacturer="Chaffoteaux", family=family, model=name,
        widthMm=1016, heightMm=CHAFF_HEIGHT[size], depthMm=383,
        dimensionNote=f"Ingombro unità esterna L×H×P da disegno pag. {dims_page} della scheda, profondità totale 383 mm. {indoor} Distanze di servizio da verificare nel manuale.",
        features=["Monoblocco inverter R32" if kind == "M" else "Split inverter R32", supply, f"Codice sistema {code}", *extra],
        productPhoto=CHAFF_PHOTOS[photo_key], sourceMetadata=source(document, "Chaffoteaux", table_page), operatingPoints=points))
assert len([p for p in products if p["manufacturer"] == "Chaffoteaux"]) == 11 + 82, "Chaffoteaux model count changed"

daikin_photo_low = photo("daikin-altherma-3m-ebla-e.jpg", "https://www.daikin.it/it_IT/privati/riscaldamento/pompe-di-calore/altherma-3m-ebla-e/_jcr_content/root/main_container/content_container/simple_container/two_column_content_b/column-container-2/image_6605.coreimg.jpeg/1739501570629/e-b-d-la04-08e-3-v3-ip1.jpeg", "Foto ufficiale Daikin Altherma 3 M EBLA 4–8 kW installata all'esterno.")
daikin_photo_high = photo("daikin-altherma-3m-ebla-d.jpg", "https://www.daikin.it/adobe/dynamicmedia/deliver/dm-aid--3d8167cc-3535-401c-8c3c-2898bd7bd5e5/04-packshot-ebla09-1-1-front.jpg", "Packshot ufficiale Daikin Altherma 3 M EBLA 9–16 kW.")

def daikin_point(label, heat, cold, cop, eer, heat_air, cool_water):
    heating = "aria esterna 7/6 °C BS/BU" if heat_air == 7 else "aria esterna −7 °C BS"
    return dict(label=label, heatingW=round(heat*1000), coolingW=round(cold*1000), cop=cop, eer=eer,
                heatingWaterSupplyC=35, coolingWaterSupplyC=cool_water, heatingOutdoorC=heat_air, coolingOutdoorC=35,
                heatingConditions=f"EN 14511 · {heating} · acqua mandata/ritorno 35/30 °C",
                coolingConditions=f"EN 14511 · aria esterna 35 °C · acqua mandata/ritorno {cool_water}/{cool_water+5} °C")

# Reviewed technical tables: Catalogo Residenziale 2025 pag. 190 (4–8 kW) and pag. 193 (9–16 kW).
# Capacities pair (1) heating A7/W35 with cooling A35/W18 and (2) heating A−7/W35 with cooling A35/W7.
for size, page, photo_ref, (width, height, depth), heat35, heatminus7, cold18, cold7, cop35, copminus7, eer18, eer7 in [
    (4, 190, daikin_photo_low, (1250, 770, 362), 6.41, 5.38, 5.98, 4.62, 4.92, 2.82, 5.64, 3.72),
    (6, 190, daikin_photo_low, (1250, 770, 362), 7.74, 6.25, 7.45, 5.57, 4.74, 2.77, 4.84, 3.47),
    (8, 190, daikin_photo_low, (1250, 770, 362), 9.37, 7.28, 8.57, 6.34, 4.52, 2.67, 4.58, 3.32),
    (9, 193, daikin_photo_high, (1380, 870, 460), 10.42, 7.89, 16.31, 11.02, 4.80, 2.45, 3.64, 2.98),
    (11, 193, daikin_photo_high, (1380, 870, 460), 12.31, 9.10, 18.25, 12.68, 4.79, 2.45, 3.42, 2.74),
    (14, 193, daikin_photo_high, (1380, 870, 460), 13.69, 10.73, 18.79, 13.09, 4.64, 2.47, 3.99, 3.02),
    (16, 193, daikin_photo_high, (1380, 870, 460), 15.96, 11.15, 18.79, 14.01, 4.53, 2.51, 3.99, 3.03),
]:
    for phase, suffix, supply in [("Monofase", "V3", "Monofase 230 V / 50 Hz")] + ([("Trifase", "W1", "Trifase 400 V / 50 Hz")] if size >= 9 else []):
        model = f"EBLA{size:02d}{'E' if size <= 8 else 'D'}{suffix}"
        products.append(dict(id=f"daikin-altherma-3m-{model.lower()}", manufacturer="Daikin", family="Altherma 3 M", model=model,
            widthMm=width, heightMm=height, depthMm=depth,
            dimensionNote=f"Ingombro unità esterna L×H×P da Catalogo Residenziale 2025 pag. {page}. Distanze di servizio da verificare nel manuale.",
            features=["Monoblocco inverter R32", "Riscaldamento e raffrescamento", supply, "Riscaldatore di riserva 3 kW opzionale",
                      "Collegamento WLAN di serie" if size <= 8 else "Cartuccia WLAN opzionale", "ACS con serbatoio opzionale",
                      "Mandata fino a 60 °C · funzionamento fino a −25 °C"],
            productPhoto=photo_ref, sourceMetadata=source("daikin-residential-2025", "Daikin", page),
            operatingPoints=[daikin_point("Caldo A7/W35 · freddo A35/W18", heat35, cold18, cop35, eer18, 7, 18),
                             daikin_point("Caldo A−7/W35 · freddo A35/W7", heatminus7, cold7, copminus7, eer7, -7, 7)]))

daikin_catalog_url = DOCS["daikin-residential-2025"][0]
daikin_3r_photo = photo("daikin-altherma-3r.jpg", f"{daikin_catalog_url}#page=161", "Foto di unità esterna Altherma 3 R dal Catalogo Residenziale 2025, pag. 161; il 3D rappresenta l'unità esterna.")
daikin_3r_mt_photo = photo("daikin-altherma-3r-mt.jpg", f"{daikin_catalog_url}#page=161", "Foto di unità esterna Altherma 3 R MT dal Catalogo Residenziale 2025, pag. 161; il 3D rappresenta l'unità esterna.")
daikin_3h_ht_photo = photo("daikin-altherma-3h-ht.jpg", f"{daikin_catalog_url}#page=173", "Vista tecnica dell'unità esterna Altherma 3 H HT dal Catalogo Residenziale 2025, pag. 173; il 3D rappresenta l'unità esterna.")

# Reviewed outdoor-unit tables: 3 R pag. 137 e 160, 3 R MT pag. 166, 3 H HT pag. 174.
# Column (1): riscaldamento A7/W35 e raffrescamento A35/W18; colonna (2): A-7/W35 e A35/W7.
def daikin_outdoor(family, model, phase, page, dims, features, row, photo_ref):
    heat35, heatminus7, cold18, cold7, cop35, copminus7, eer18, eer7 = row
    return dict(id=f"daikin-{family.lower().replace(' ', '-')}-{model.lower()}", manufacturer="Daikin", family=family, model=model,
        widthMm=dims[0], heightMm=dims[1], depthMm=dims[2],
        dimensionNote=f"Ingombro unità esterna L×H×P da Catalogo Residenziale 2025 pag. {page}. Unità interna idronica prevista dal sistema, da progettare separatamente. Distanze di servizio da verificare nel manuale.",
        features=features + [phase], productPhoto=photo_ref, sourceMetadata=source("daikin-residential-2025", "Daikin", page),
        operatingPoints=[daikin_point("Caldo A7/W35 · freddo A35/W18", heat35, cold18, cop35, eer18, 7, 18),
                         daikin_point("Caldo A−7/W35 · freddo A35/W7", heatminus7, cold7, copminus7, eer7, -7, 7)])

for model, phase, row in [
    ("ERGA04EV", "Monofase 230 V / 50 Hz", (6.41, 5.38, 5.98, 4.62, 4.93, 2.82, 5.64, 3.73)),
    ("ERGA06EVH", "Monofase 230 V / 50 Hz", (7.74, 6.25, 7.45, 5.57, 4.75, 2.78, 4.84, 3.48)),
    ("ERGA08EVH7", "Monofase 230 V / 50 Hz", (9.37, 7.28, 8.57, 6.34, 4.50, 2.67, 4.58, 3.32)),
]:
    products.append(daikin_outdoor("Altherma 3 R", model, phase, 137, (740, 884, 387),
        ["Splittata a gas R32", "Riscaldamento e raffrescamento", "Mandata fino a 65 °C", "Funzionamento fino a −25 °C", "Unità interna idronica EHSX/EBSX/EHVX/EBVX/EBBX da abbinare"], row, daikin_3r_photo))

for model, phase, row in [
    ("ERLA11DV3", "Monofase 230 V / 50 Hz", (12.44, 9.02, 17.44, 13.15, 4.83, 2.98, 3.68, 2.67)),
    ("ERLA11DW1", "Trifase 400 V / 50 Hz", (12.44, 9.02, 17.44, 13.15, 4.83, 2.98, 3.68, 2.67)),
    ("ERLA14DV3", "Monofase 230 V / 50 Hz", (13.38, 9.29, 17.95, 13.53, 4.72, 2.92, 3.91, 2.84)),
    ("ERLA14DW1", "Trifase 400 V / 50 Hz", (13.38, 9.29, 17.95, 13.53, 4.72, 2.92, 3.91, 2.84)),
    ("ERLA16DV37", "Monofase 230 V / 50 Hz", (15.96, 10.84, 17.95, 13.53, 4.62, 2.67, 3.91, 2.84)),
    ("ERLA16DW17", "Trifase 400 V / 50 Hz", (15.96, 10.84, 17.95, 13.53, 4.62, 2.67, 3.91, 2.84)),
]:
    products.append(daikin_outdoor("Altherma 3 R", model, phase, 160, (870, 1100, 460),
        ["Splittata a gas R32", "Riscaldamento e raffrescamento", "Mandata fino a 65 °C", "Funzionamento fino a −25 °C", "Unità interna idronica EHSX/EBSX/EHVX/EBVX/EBBX da abbinare"], row, daikin_3r_photo))

for model, phase, row in [
    ("ERRA08EV3", "Monofase 230 V / 50 Hz", (7.95, 7.49, 10.89, 7.33, 4.70, 3.04, 4.35, 3.09)),
    ("ERRA08EW1", "Trifase 400 V / 50 Hz", (7.95, 7.49, 10.89, 7.33, 4.89, 3.14, 4.52, 3.20)),
    ("ERRA10EV3", "Monofase 230 V / 50 Hz", (9.25, 8.84, 11.77, 7.97, 4.52, 2.94, 4.11, 3.00)),
    ("ERRA10EW1", "Trifase 400 V / 50 Hz", (9.25, 8.84, 11.77, 7.97, 4.69, 3.06, 4.26, 3.10)),
    ("ERRA12EV3", "Monofase 230 V / 50 Hz", (9.97, 10.28, 12.66, 8.62, 4.37, 2.91, 3.87, 2.91)),
    ("ERRA12EW1", "Trifase 400 V / 50 Hz", (9.97, 10.28, 12.66, 8.62, 4.51, 3.01, 4.02, 3.00)),
]:
    products.append(daikin_outdoor("Altherma 3 R MT", model, phase, 166, (1003, 1270, 533),
        ["Splittata a gas R32", "Riscaldamento e raffrescamento", "Mandata fino a 65 °C", "Funzionamento fino a −25 °C", "Unità interna idronica ELSX/ELVX/ELBX da abbinare"], row, daikin_3r_mt_photo))

for model, phase, row in [
    ("EPRA14DV37", "Monofase 230 V / 50 Hz", (10.18, 10.47, 10.55, 6.90, 4.87, 2.22, 4.13, 2.69)),
    ("EPRA14DW17", "Trifase 400 V / 50 Hz", (9.75, 10.99, 10.55, 6.90, 4.49, 2.29, 4.13, 2.69)),
    ("EPRA16DV37", "Monofase 230 V / 50 Hz", (10.91, 11.91, 11.51, 7.88, 4.87, 2.22, 4.11, 2.69)),
    ("EPRA16DW17", "Trifase 400 V / 50 Hz", (10.44, 12.50, 11.51, 7.88, 4.50, 2.29, 4.11, 2.69)),
    ("EPRA18DV37", "Monofase 230 V / 50 Hz", (12.12, 12.47, 12.70, 8.86, 4.87, 2.22, 4.08, 2.69)),
    ("EPRA18DW17", "Trifase 400 V / 50 Hz", (11.60, 13.08, 12.70, 8.86, 4.50, 2.29, 4.08, 2.69)),
]:
    products.append(daikin_outdoor("Altherma 3 H HT", model, phase, 174, (1003, 1270, 533),
        ["Idrosplit R32", "Riscaldamento e raffrescamento", "Mandata fino a 70 °C", "Funzionamento fino a −28 °C", "Unità interna idronica ETSX/ETVX/ETBX da abbinare"], row, daikin_3h_ht_photo))

assert len([p for p in products if p["manufacturer"] == "Daikin"]) == 32

gree_photo = photo("gree-versati-v.png", "https://service.argoonline.it/area_riservata/WebDocTec/Images/Famiglie/gree/VERSATIV_monoblocco_linea.png", "Foto ufficiale Gree VERSATI V monoblocco, gamma 6–14 kW.")
gree_16_photo = photo("gree-versati-v-16.jpg", "https://service.argoonline.it/area_riservata/WebDocTec/Images/Product/VersatiV_16kW_LR.jpg", "Foto ufficiale Gree VERSATI V 16 kW, unità esterna a due ventilatori.")
reader = PdfReader(SOURCE / "gree-versati-v.pdf")
for size, page in [(6, 8), (8, 10), (10, 12), (12, 14), (14, 16), (16, 20)]:
    text = reader.pages[page-1].extract_text()
    model_size = f"{size}.0" if size < 10 else str(size)
    dimensions = (943, 1615, 464) if size == 16 else (1206, 880, 445)
    if f"GRS-CQ{model_size}Pd/NpG4-E" not in text or "/".join(map(str, [dimensions[1], dimensions[0], dimensions[2]])) not in text:
        raise ValueError("Gree source row/dimensions missing")
    # Same-page named nominal capacity / EER-COP rows, no promotional rated values.
    capacities = re.findall(r"Capacità nominale kW ([\d,]+) ([\d,]+)", text)
    efficiency = re.findall(r"EER/COP ([\d,]+) ([\d,]+)", text)
    convert = lambda value: float(value.replace(",", "."))
    points = []
    for index, water in enumerate([35,45]):
        cold, heat = map(convert, capacities[index])
        eer, cop = map(convert, efficiency[index])
        # The first row's cooling is W18; pair its heating with documented W7 cooling.
        cold = convert(capacities[1][0])
        eer = convert(efficiency[1][0])
        points.append(point(f"Caldo A7/W{water} · freddo A35/W7", heat, cold, cop, eer, water))
    for phase, suffix in [("monofase", "E")] + ([("trifase", "M")] if size >= 10 else []):
        if f"GRS-CQ{model_size}Pd/NpG4-{suffix}" not in text:
            raise ValueError("Gree phase model missing")
        products.append(dict(id=f"gree-versati-v-{size}-{phase}", manufacturer="Gree", family="VERSATI V", model=f"GRS-CQ{model_size}Pd/NpG4-{suffix}", widthMm=dimensions[0], heightMm=dimensions[1], depthMm=dimensions[2],
        dimensionNote=f"Ingombro unità esterna L×H×P, brochure pag. {page}. Distanze di servizio e area di installazione R290 da verificare nel manuale.",
        features=["Monoblocco DC Inverter R290", "Mandata fino a 80 °C nei limiti di funzionamento", "Pannello remoto di serie", "ACS con accumulo e valvola opzionali"] + (["Monofase 230 V / 50 Hz" if phase == "monofase" else "Trifase 400 V / 50 Hz"] if size >= 10 else []), productPhoto=gree_16_photo if size == 16 else gree_photo, sourceMetadata=source("gree-versati-v", "Gree", page), operatingPoints=points))

# Reviewed parameter tables: Split pages 9–10, All In One pages 9–10.
# Each system has its own documented EER; do not copy performance between variants.
for configuration in ["split", "all-in-one"]:
    document = "gree-versati-iii" if configuration == "split" else "gree-versati-iii-all-in-one"
    pages = PdfReader(SOURCE / f"{document}.pdf").pages
    technical = pages[8].extract_text() + pages[9].extract_text()
    if "975×396×702" not in technical or "982×427×787" not in technical or "12°C/7°C" not in technical:
        raise ValueError("Gree III reviewed technical table missing")
    official_photo = photo(f"gree-versati-iii-{configuration}.png", f"https://service.argoonline.it/area_riservata/WebDocTec/Images/Famiglie/gree/VERSATI-{'SPLIT' if configuration == 'split' else 'ALL-IN-ONE'}.png", f"Foto ufficiale di gamma VERSATI III {configuration}; il 3D rappresenta l’unità esterna.")
    for size, heat35, heat45, cold, cop35, cop45, eer in [
        (4, 4, 4, 3.15, 5.1, 3.9, 3.4),
        (6, 6, 5.9, 4.09, 5.0, 3.9, 3.2),
        (8, 8, 8, 5.3, 4.7, 3.7, 3.0 if configuration == "split" else 3.1),
        (10, 9.5, 9.5, 6.5, 4.6, 3.6, 2.9),
    ]:
        code = {4: "ER010W1510", 6: "ER010W1500", 8: "ER010W1480", 10: "ER010W1730"}[size]
        if code not in technical:
            raise ValueError(f"Gree III model missing: {code}")
        model_size = f"{size}.0" if size < 10 else str(size)
        width, height, depth = (975, 702, 396) if size <= 6 else (982, 787, 427)
        indoor_code = ({4: "ER010N1510", 6: "ER010N1500", 8: "ER010N1480", 10: "ER010N1750"} if configuration == "split" else {4: "ER010N1770", 6: "ER010N1780", 8: "ER010N1760", 10: "ER010N1730"})[size]
        products.append(dict(id=f"gree-versati-iii-{size}-{configuration}-monofase", manufacturer="Gree", family=f"VERSATI III {'Split' if configuration == 'split' else 'All In One'}", model=f"GRS-CQ{model_size}Pd/NhH-E(O) + {indoor_code}",
            widthMm=width, heightMm=height, depthMm=depth,
            dimensionNote=f"Ingombro unità esterna L×H×P da Service Manual pag. {'9' if configuration == 'split' else '10'}. Modulo interno {'460×860×318 mm' if configuration == 'split' else '600×1756×600 mm'}, da progettare separatamente. Distanze di servizio da verificare nel manuale.",
            features=["DC Inverter R32", "Monofase 230 V / 50 Hz", f"Unità esterna {code}", f"Unità interna {indoor_code}", "Mandata riscaldamento fino a 60 °C nei limiti di funzionamento", "Modulo interno idronico" if configuration == "split" else "Modulo interno con accumulo ACS integrato"],
            productPhoto=official_photo, sourceMetadata=source(document, "Gree", 9),
            operatingPoints=[point("Caldo A7/W35 · freddo A35/W7", heat35, cold, cop35, eer), point("Caldo A7/W45 · freddo A35/W7", heat45, cold, cop45, eer, 45)]))

# The live VERSATI listing has 10 monoblocco + 4 Split + 4 All In One systems.
assert len([p for p in products if p["manufacturer"] == "Gree"]) == 18

# Page 4 distinguishes Min/Nom/Max thermal outputs; COP/EER remain nominal.
for document in ["chaffoteaux", "chaffoteaux-arianext-lite"]:
    text = page_text(document, 4)
    rows = re.findall(r"Potenza\s+termica\s+kW\s+([^\n]+)", text)
    capacities = [[tuple(float(v.replace(",", ".")) for v in cell.split("/"))
                   for cell in row.split()] for row in rows]
    assert len(capacities) == 5 and all(len(row) == 8 for row in capacities), "Chaffoteaux Min/Nom/Max table changed"
    assert all(len(cell) == 3 and 0 < cell[0] <= cell[1] <= cell[2]
               for row in capacities for cell in row), "Invalid Chaffoteaux capacity range"
    for product in products:
        if product["sourceMetadata"]["sha256"] != DOCS[document][1] or "maxHeatingW" in product["operatingPoints"][0]:
            continue
        size = int(re.search(r"ARIANEXT (?:PLUS|LITE) (\d+)", product["model"])[1])
        column = {35: 0, 50: 1, 80: 2, 120: 4, 150: 6}[size]
        for op in product["operatingPoints"]:
            heat_row = 1 if op["heatingOutdoorC"] == -7 else 2 if op["heatingWaterSupplyC"] == 45 else 0
            heat, cold = capacities[heat_row][column], capacities[3][column]
            assert op["heatingW"] == round(heat[1] * 1000) and op["coolingW"] == round(cold[1] * 1000), "Chaffoteaux nominal row mismatch"
            op["maxHeatingW"], op["maxCoolingW"] = round(heat[2] * 1000), round(cold[2] * 1000)


# LG THERMA V: one datasheet per model. Rated rows are read by label order (capacity, power, COP/EER) and asserted; dimensions are the first "Netto (L x A x P)" row (outdoor unit).
LG_PHOTOS = {
    "monoblocco-s-ii": photo("lg-therma-v-monoblocco-s-ii.jpg", "https://www.climanext.net/wp-content/uploads/2026/10/simulatore-lg-therma-v-r32-monoblocco-s-ii-12-16kw.jpg", "Immagine di gamma LG THERMA V Monoblocco S II R32 dal sito Climanext; dimensioni e potenza dipendono dal modello."),
    "r290": photo("lg-therma-v-r290-premium.jpg", "https://www.climanext.net/wp-content/uploads/2026/10/simulatore-lg-therma-v-r290-premium-12-16kw.jpg", "Immagine di gamma LG THERMA V R290 Premium dal sito Climanext; dimensioni e potenza dipendono dal modello."),
    "monoblocco-g": photo("lg-therma-v-monoblocco-g.jpg", "https://www.climanext.net/wp-content/uploads/2026/09/lg-linea-therma-v-monoblocco-g-ritaglio-400x300.jpg", "Immagine di gamma LG THERMA V Monoblocco G dal sito Climanext."),
}
LG_FAMILIES = {"monoblocco-s-ii": "THERMA V Monoblocco S II R32", "r290": "THERMA V Premium R290", "monoblocco-g": "THERMA V Monoblocco G R32"}
LG_ORDER = ["A7/W35", "A7/W55", "A2/W35", "A35/W18", "A35/W7"]

def lg_pages(document):
    with pdfplumber.open(doc_file(document)) as pdf:
        return [page.extract_text() or "" for page in pdf.pages[:14]]

def lg_unit(document, code):
    texts = lg_pages(document)
    page = next(n for n, text in enumerate(texts, 1) if "SCOP" in text and re.search(r"A7 ?/ ?W35 kW", text))
    rows = re.findall(r"A(\d+) ?/ ?W(\d+) (kW|W/W) (\d+[.,]?\d*)", texts[page - 1])
    assert [(f"A{a}/W{w}", unit) for a, w, unit, _ in rows] == [(label, unit) for unit in ("kW", "kW", "W/W") for label in LG_ORDER], f"{document}: rated table changed"
    values = [float(v.replace(",", ".")) for *_, v in rows]
    capacity, power, ratio = dict(zip(LG_ORDER, values[:5])), dict(zip(LG_ORDER, values[5:10])), dict(zip(LG_ORDER, values[10:]))
    for label in LG_ORDER:  # COP/EER must agree with capacity / power within rounding of the published cells
        assert abs(capacity[label] / power[label] - ratio[label]) <= 0.08 * ratio[label], f"{document}: {label} COP/EER inconsistent"
    size = next(re.search(r"Netto \(L x A x P\) mm ([\d,]+) x ([\d,]+) x ([\d,]+)", text) for text in texts if "Netto (L x A x P)" in text)
    width, height, depth = (int(v.replace(",", "")) for v in size.groups())
    joined = "\n".join(texts)
    gas, charge = re.search(r"Tipo - (R\d+)", joined)[1], re.search(r"Carica kg ([\d,]+)", joined)[1]
    three_phase = "380-415" in joined
    circulator = "Circolatore" in joined
    assert "monoblocco-g" in document or (three_phase == (code[4] == "3") and circulator), f"{document}: phase or circulator mismatch"
    return page, capacity, power, ratio, (width, height, depth), gas, charge, three_phase, circulator

def lg_point(label, heat, cold, cop, eer, heat_water, heat_air, cool_water):
    return dict(label=label, heatingW=round(heat*1000), coolingW=round(cold*1000), cop=cop, eer=eer,
                heatingWaterSupplyC=heat_water, coolingWaterSupplyC=cool_water, heatingOutdoorC=heat_air, coolingOutdoorC=35,
                heatingConditions=f"Scheda LG · aria esterna {heat_air} °C · acqua mandata {heat_water} °C",
                coolingConditions=f"Scheda LG · aria esterna 35 °C · acqua mandata {cool_water} °C")

for document, (_, _, code) in LG_DOCS.items():
    kind = "monoblocco-g" if "monoblocco-g" in document else "r290" if "r290" in document else "monoblocco-s-ii"
    page, cap, power, ratio, (width, height, depth), gas, charge, three_phase, circulator = lg_unit(document, code)
    water_air = lambda label: tuple(int(v) for v in reversed(re.fullmatch(r"A(\d+)/W(\d+)", label).groups()))  # (water, air)
    points = [lg_point(f"Caldo {h} · freddo {c}", cap[h], cap[c], ratio[h], ratio[c], water_air(h)[0], water_air(h)[1], water_air(c)[0])
              for h, c in [("A7/W35", "A35/W7"), ("A7/W55", "A35/W7"), ("A2/W35", "A35/W7"), ("A7/W35", "A35/W18")]]
    products.append(dict(id="lg-" + re.sub(r"[^a-z0-9]+", "-", code.lower()).strip("-"), manufacturer="LG", family=LG_FAMILIES[kind], model=code,
        widthMm=width, heightMm=height, depthMm=depth,
        dimensionNote=f"Ingombro netto L×A×P da scheda p.{page}. Distanze di servizio e fissaggio da verificare nella scheda.",
        features=[f"Monoblocco inverter {gas}", "Trifase 400 V / 50 Hz" if three_phase else "Monofase 230 V / 50 Hz", f"Carica refrigerante {charge} kg", f"Codice listino {code}", *(["Circolatore integrato"] if circulator else [])],
        productPhoto=LG_PHOTOS[kind], sourceMetadata=source(document, "LG", page), operatingPoints=points))
assert len([p for p in products if p["manufacturer"] == "LG"]) == len(LG_DOCS), "LG model count changed"

version_hash = hashlib.sha256(json.dumps(products, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]
catalog = dict(version=f"heat-pumps-{version_hash}", products=products)
out = ROOT / "catalog-data/generated/heat-pumps.json"
history_path = out.with_name("heat-pumps-history.json")
history = json.loads(history_path.read_text(encoding="utf8")) if history_path.exists() else {}
if out.exists():
    previous = json.loads(out.read_text(encoding="utf8"))
    if previous["version"] != catalog["version"]:
        history[previous["version"]] = previous
out.write_text(json.dumps(catalog, indent=2, ensure_ascii=False)+"\n", encoding="utf8")
history_path.write_text(json.dumps(history, ensure_ascii=False, separators=(",", ":"))+"\n", encoding="utf8")
def doc_manufacturer(name):
    return "Chaffoteaux" if name.startswith("chaffoteaux") else "Daikin" if name.startswith("daikin") else "LG" if name.startswith("lg") else "Gree"

manifest_path.write_text(json.dumps([dict(name=name, timestampBasis="file-acquired-at", **source(name, doc_manufacturer(name), None)) for name in DOCS], indent=2, ensure_ascii=False)+"\n", encoding="utf8")
print(f"Generated {len(products)} models from pinned official PDFs")
