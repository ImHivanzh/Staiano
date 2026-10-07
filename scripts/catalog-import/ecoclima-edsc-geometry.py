"""Archive original embedded EDSC-C drawings and their manually reviewed OEM quotes.

The HTML cells contain PNG drawings, not text. Review these original diagrams
before changing any quote. The normal Ecoclima importer applies this curation.
"""
from pathlib import Path
import base64
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[2]
HTML = ROOT / "catalog-data/sources/ecoclima/complete-edsc-c-96ed3c92.html"
SOURCE_SHA = "2aef168ca633e5a4cd3b01f0bc4a688fcf0e7f4d1f786d03606328708ccd3db5"
SOURCE_URL = "https://www.ecoclima.com/catalogo-generale/diffusione/diffusori/edsc-c-edsc-cc-edsc-q-diffusori-a-scomparsa-per-controsoffitto-in-cartongesso"
if hashlib.sha256(HTML.read_bytes()).hexdigest() != SOURCE_SHA:
    raise ValueError("EDSC source revision changed: review original drawings")
html = HTML.read_text(encoding="utf8")
section = html.split("Dimensioni EDSC-C</h4>", 1)[1].split("Dimensioni EDSC-CC</h4>", 1)[0]
images = re.findall(r'src="data:image/png;base64,([^"]+)"', section)
if len(images) != 3:
    raise ValueError("EDSC-C drawing table topology changed")

# Nominal connection, circular body, cover, bracket width, full height, image SHA.
reviewed = [
    (100, 238, 176, 307.7, 90.2, "d1de4f804bdc5940a27a3461ad2911c496cfcf19b362b5319c25c8a983bc7e20"),
    (125, 238, 176, 307.7, 95.2, "aeb0ad4208326eef946fcfc4ba120eded4632f184d19d56fd8c83f9f13448bc7"),
    (160, 298, 231, 372, 92.2, "c741b085a5840da475c96861659d2a47fa3fb98c7d6ccc44ea4f295471f79970"),
]
destination = ROOT / "public/catalog-assets/edsc-c"
destination.mkdir(parents=True, exist_ok=True)
variants = {}
for encoded, (nominal, diameter, cover, brackets, height, expected) in zip(images, reviewed, strict=True):
    data = base64.b64decode(encoded, validate=True)
    if hashlib.sha256(data).hexdigest() != expected:
        raise ValueError(f"Original drawing changed: EDSC-C {nominal}")
    name = f"edsc-c-{nominal}-dimensions.png"
    (destination / name).write_bytes(data)
    variants[str(nominal)] = {
        "widthMm": diameter, "heightMm": diameter, "depthMm": height,
        "faceWidthMm": diameter, "faceHeightMm": diameter, "bodyDepthMm": height,
        "originalDimensionsMm": {"bodyDiameterMm": diameter, "coverDiameterMm": cover,
                                 "bracketWidthMm": brackets, "heightMm": height},
        "dimensionNote": f"Disegno originale EDSC-C Ø{nominal}: ingombro circolare corpo Ø{diameter} mm, altezza totale {height} mm; copriforo Ø{cover} mm, ingombro con staffe {brackets} mm. Diametro nominale di connessione distinto dalla faccia. Profondità delle staffe non pubblicata.",
        "dimensionDrawing": {"localPath": f"/catalog-assets/edsc-c/{name}", "sourceUrl": SOURCE_URL,
                             "sha256": expected, "caption": f"Disegno dimensionale originale Ecoclima EDSC-C {nominal}"},
    }
curation = ROOT / "catalog-data/curation/ecoclima-geometry.json"
geometry = json.loads(curation.read_text(encoding="utf8"))
geometry["EDSC-C"] = {"sourceSha256": SOURCE_SHA, "mountings": ["ceiling"], "shape": "circle",
    "bodyDepthMm": None, "note": "Corpo circolare, copriforo e staffe hanno quote distinte. Le tre immagini originali nella tabella HTML Dimensioni EDSC-C documentano gli ingombri; il diametro nominale indica la connessione.",
    "variantsByNominalDiameterMm": variants}
curation.write_text(json.dumps(geometry, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
print(json.dumps({"reviewedDrawings": len(variants), "sourceSha256": SOURCE_SHA}))
