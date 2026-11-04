"""Split mono LG dalle schede tecniche Climanext (listino LG 2026).

Legge i PDF di catalog-data/sources/splits/lg-climanext/ (scaricati da
climanext.net/wp-content/uploads/2026/09/), ricava misure e capacita' nominali
dalla scheda e scrive catalog-data/curation/split-lg-climanext.json.
Nessun dato inventato: se un valore non e' nella scheda lo script si ferma.
Poi: npx tsx scripts/catalog-import/split.ts [--apply].
"""
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "catalog-data/sources/splits/lg-climanext"
OUT = ROOT / "catalog-data/curation/split-lg-climanext.json"
BASE = "https://www.climanext.net/wp-content/uploads/2026/09/"
NOW = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

# scheda -> (famiglia, interna, esterna, taglia kBtu/h)
SYSTEMS = {
    "a09ga1": ("Artcool Gallery Photo", "A09GA1.NSE", "A09GA1.U18", 9),
    "a12ga1": ("Artcool Gallery Photo", "A12GA1.NSE", "A12GA1.U18", 12),
    "aa09sp": ("Artcool Mirror", "AA09SP.NS1", "AA09SP.U18", 9),
    "aa12sp": ("Artcool Mirror", "AA12SP.NS1", "AA12SP.U18", 12),
    "aa18sp": ("Artcool Mirror", "AA18SP.NS1", "AA18SP.U18", 18),
    "ez09csn": ("Dualcool Libero Smart", "EZ09CSN.CSJ1", "EZ09CSU.CA31", 9),
    "ez12csn": ("Dualcool Libero Smart", "EZ12CSN.CSJ1", "EZ12CSU.CA31", 12),
    "ez18csn": ("Dualcool Libero Smart", "EZ18CSN.CSK1", "EZ18CSU.CL21", 18),
    "ez24csn": ("Dualcool Libero Smart", "EZ24CSN.CSK1", "EZ24CSU.C241", 24),
    "wz09awn": ("Libero", "WZ09AWN.SNU1", "WZ09AWU.SUU1", 9),
    "wz12awn": ("Libero", "WZ12AWN.SNU1", "WZ12AWU.SUU1", 12),
    "wz18awn": ("Libero", "WZ18AWN.SNU1", "WZ18AWU.SUU1", 18),
    "wz24awn": ("Libero", "WZ24AWN.SNU1", "WZ24AWU.SUU1", 24),
}
DIM = re.compile(r"Dimensioni mm\s+(\d+(?:[.,]\d+)?)\s*[xX×*]\s*(\d+(?:[.,]\d+)?)\s*[xX×*]\s*(\d+(?:[.,]\d+)?)")


def num(value):
    return round(float(value.replace(",", ".")))


def pages(pdf):
    with pdfplumber.open(pdf) as document:
        return [page.extract_text() or "" for page in document.pages]


def parse(key):
    pdf = DOCS / f"lg-scheda-mono-{key}.pdf"
    texts = pages(pdf)
    full = "\n".join(texts)
    dims = [(i + 1, m) for i, t in enumerate(texts) for m in DIM.finditer(t)]
    assert len(dims) == 2, (key, "attese 2 righe Dimensioni mm (interna, esterna)", len(dims))
    (ipage, indoor), (opage, outdoor) = dims
    cooling = re.search(r"Cooling Nominale W\s+(\d+)", full)
    heating = re.search(r"Heating \+7°C Nominale W\s+(\d+)", full)
    assert cooling and heating, (key, "capacita' nominali assenti")
    assert "R32" in full, (key, "refrigerante R32 assente")
    return {
        "pdf": pdf,
        "sha": hashlib.sha256(pdf.read_bytes()).hexdigest().upper(),
        "indoor": tuple(num(v) for v in indoor.groups()),
        "outdoor": tuple(num(v) for v in outdoor.groups()),
        "ipage": ipage,
        "opage": opage,
        "cooling": int(cooling.group(1)),
        "heating": int(heating.group(1)),
    }


def source(key, data, page):
    return {
        "manufacturer": "LG",
        "sourceUrl": f"{BASE}lg-scheda-mono-{key}.pdf",
        "sourceType": "pdf",
        "documentRevision": f"Climanext scheda tecnica LG {key.upper()} (listino LG 2026)",
        "retrievedAt": NOW,
        "importedAt": NOW,
        "sha256": data["sha"],
        "page": page,
    }


def main():
    indoor_units, outdoor_units, combinations = [], [], []
    for key, (family, indoor, outdoor, size) in SYSTEMS.items():
        data = parse(key)
        ratio = data["cooling"] / (size * 293.07)
        assert 0.85 < ratio < 1.15, (key, "potenza incoerente con la taglia", ratio)
        uid = "lg-" + indoor.split(".")[0].lower()
        iw, ih, idp = data["indoor"]
        ow, oh, od = data["outdoor"]
        indoor_units.append(
            {
                "id": uid,
                "manufacturer": "LG",
                "family": family,
                "model": indoor,
                "mounting": "wall",
                "shape": "rectangular",
                "sizeClass": str(size),
                "nominalCoolingW": data["cooling"],
                "nominalHeatingW": data["heating"],
                "widthMm": iw,
                "heightMm": ih,
                "depthMm": idp,
                "region": "Italia (LG Italia, scheda Climanext)",
                "notes": "Unita' interna R32 della scheda Climanext; capacita' nominali del kit mono con unita' esterna " + outdoor + ".",
                "sourceMetadata": source(key, data, data["ipage"]),
            }
        )
        outdoor_units.append(
            {
                "manufacturer": "LG",
                "model": outdoor,
                "widthMm": ow,
                "heightMm": oh,
                "depthMm": od,
                "dimensionNote": f"Dimensioni mm (L x A x P) dalla scheda Climanext {key.upper()}, p. {data['opage']}.",
                "sourceMetadata": source(key, data, data["opage"]),
            }
        )
        combinations.append(
            {
                "id": uid + "-mono",
                "manufacturer": "LG",
                "mode": "mono",
                "outdoorModel": outdoor,
                "indoorProductIds": [uid],
                "coolingCapacityW": data["cooling"],
                "heatingCapacityW": data["heating"],
                "maxCoolingCapacityW": None,
                "maxHeatingCapacityW": None,
                "indoorCoolingW": [data["cooling"]],
                "indoorHeatingW": [data["heating"]],
                "minIndoorUnits": 1,
                "maxIndoorUnits": 1,
                "maxConnectedCapacityW": None,
                "approved": True,
                "notes": "Kit monosplit LG da scheda tecnica Climanext: capacita' nominali a +35 C / +7 C.",
                "sourceMetadata": source(key, data, data["ipage"]),
                "region": "Italia (LG Italia, scheda Climanext)",
                "secondarySourceMetadata": [],
            }
        )
    OUT.write_text(
        json.dumps(
            {
                "manufacturer": "LG",
                "revision": "Climanext schede tecniche LG 2026 mono split",
                "indoorUnits": indoor_units,
                "outdoorUnits": outdoor_units,
                "combinations": combinations,
                "quarantined": [],
                "limitations": [
                    "Artcool Gallery LCD (A09GA2/A12GA2) esclusa: Climanext non pubblica la scheda tecnica."
                ],
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(len(combinations), "sistemi mono ->", OUT)


if __name__ == "__main__":
    main()
