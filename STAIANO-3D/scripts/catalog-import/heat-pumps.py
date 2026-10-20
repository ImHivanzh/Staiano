"""Offline normalization of reviewed official heat-pump tables; hashes pin sources.

Run with the bundled Python (pypdf). Changed documents require review of the
source rows before changing their expected hash. No interpolation of capacities.
"""
from pathlib import Path
import hashlib
import json
from datetime import datetime, timezone
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "catalog-data/sources/heat-pumps"
DOCS = {
    "chaffoteaux": ("https://www.chaffoteaux.it/themes/file_product/pdf40475-20220610115628.pdf", "50dd1e10b157906c3443ab9678d1d0960a91f50189f123e0aa16a674575a0bf9", "Scheda ARIANEXT PLUS M LINK R32 2022"),
    "chaffoteaux-arianext-lite": ("https://www.chaffoteaux.it/themes/file_product/pdf49969-20220517110607.pdf", "c83e85bb612e57d95c60f3f07c7a82b50cf3fc7a523a154b5e1a55bcb9be24ca", "Scheda ARIANEXT LITE M LINK R32 2022"),
    "gree-versati-v": ("https://service.argoonline.it/area_riservata/WebDocTec/Documents/SCP/GREE_Brochure_VersatiV_2025.pdf", "d7d4778eea36e2bd4287db4a42a25ffa0ea67baae978c685bc97d7681b805a2b", "Brochure VERSATI V 2025"),
    "gree-versati-iii": ("https://service.argoonline.it/area_riservata/WebDocTec/Documents/SER/Service%20Manual%20for%20VERSATI%20R32%20SPLIT.pdf", "781db69b864400db2204e825486109fd0eb3d02454cc45ce957f28dffb620e75", "Service Manual VERSATI III Split · technical data"),
    "gree-versati-iii-all-in-one": ("https://service.argoonline.it/area_riservata/WebDocTec/Documents/SER/service%20manual%20for%20versati%20split%20all%20in%20one.pdf", "5451e894bd01085fc7a4a20ccac9110d37ff6e3db698939b3aef802c79135760", "Service Manual VERSATI III All In One · technical data"),
    "daikin-residential-2025": ("https://www.daikin.it/content/dam/DACI-Internet/Download/catalogo-generale-2025/202501%20Catalogo%20Residenziale%2020250429.pdf", "a4414ccfb82ba4e6f29c6d456c53ffb7ab2dcb26a48f78be9b9f1fe815d4129a", "Catalogo Residenziale 2025"),
}
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
    import re
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
history_path.write_text(json.dumps(history, indent=2, ensure_ascii=False)+"\n", encoding="utf8")
def doc_manufacturer(name):
    return "Chaffoteaux" if name.startswith("chaffoteaux") else "Daikin" if name.startswith("daikin") else "Gree"

manifest_path.write_text(json.dumps([dict(name=name, timestampBasis="file-acquired-at", **source(name, doc_manufacturer(name), None)) for name in DOCS], indent=2, ensure_ascii=False)+"\n", encoding="utf8")
print(f"Generated {len(products)} models from pinned official PDFs")
