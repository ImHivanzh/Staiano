"""Import verified hydronic towel radiators from the Cordivari 2025 catalog.

Keeps legacy IDs unchanged. Source PDF is already acquired as cordivari-colours.pdf.
Run --apply to write the catalog; without it validate and print counts only.
"""
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "catalog-data/sources/cordivari-colours.pdf"
URL = "https://www.cordivari.it/wp-content/uploads/2023/10/Catalogo-Radiatori-e-Scaldasalviette-IT-2025.pdf"
EXPECTED_SHA = "23a5c7777399c7b721165ca91962ed972193c58454cd7c0f51af100cc299279d"
# PDF page, family, collector envelope. Depth is explicitly schematic, not installation clearance.
FAMILIES = [
    (55, "Claudia Elite", 40), (57, "Claudia interasse 50", 40),
    (61, "Claudia Square", 30), (63, "Claudia Wide", 40),
    (65, "Anna", 40), (67, "Naike Square", 30), (69, "Naike ST", 30),
    (71, "Lucy 18", 30), (75, "Lucy 18 Wide", 30), (77, "Lucy 25", 30),
    (81, "Gloria 18", 30), (83, "Gloria 22", 30), (89, "Gloria 22 Wide", 30),
    (91, "Dory", 30), (93, "Daria", 38), (95, "Katia VXn", 30),
    (99, "Katia VX Wide", 30), (105, "Samira", 30), (107, "Samira Wide", 30),
]

def number(value):
    return float(value.replace(",", "."))

def parse_rows(text):
    """Original PDF reading order places each merged height before its rows."""
    table = text.split("Potenza termica", 1)[1].split("I codici", 1)[0]
    height = None
    rows = []
    for line in table.splitlines():
        if re.fullmatch(r"\s*\d{3,4}\s*", line):
            height = int(line)
            continue
        codes = re.findall(r"\b3\d{12}\b", line)
        if not codes:
            continue
        dimensions = re.findall(r"\d+(?:[,.]\d+)?", line[:line.index(codes[0])])
        values = line[line.index(codes[-1]) + len(codes[-1]):].split()
        assert height and len(dimensions) == 2 and len(values) == 7, line
        width, interaxis = map(number, dimensions)
        weight, _, water, q50, q30, exponent = map(number, values[:6])
        assert 0 < interaxis < width and 0 < q30 < q50 < 3000 and 1 < exponent < 2
        rows.append((height, width, interaxis, codes, weight, water, q50, q30, exponent))
    assert rows
    return rows

def main():
    data = SOURCE.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    assert digest == EXPECTED_SHA, "PDF changed: review tables before importing"
    pdf = PdfReader(SOURCE)
    now = datetime.now(timezone.utc).isoformat()
    products, source_pages = [], {}
    for page, family, depth in FAMILIES:
        text = pdf.pages[page - 1].extract_text()
        previous = pdf.pages[page - 2].extract_text()
        pressure = number(re.search(r"Pressione max:\s*(\d+)", previous)[1])
        rows = parse_rows(text)
        slug = re.sub(r"[^a-z0-9]+", "-", family.lower()).strip("-")
        photo = max(pdf.pages[page - 2].images, key=lambda image: image.image.width * image.image.height)
        extension = Path(photo.name).suffix.lower()
        assert extension in [".jpg", ".jpeg", ".png"]
        photo_name = "cordivari-range-" + slug + extension
        photo_metadata = dict(localPath="/catalog-assets/radiators/" + photo_name,
                              sourceUrl=URL, sha256=hashlib.sha256(photo.data).hexdigest(),
                              caption=f"Fotografia ufficiale Cordivari {family}; immagine di famiglia, finitura e dimensioni dipendono dalla scelta.")
        if "--apply" in sys.argv:
            (ROOT / "public/catalog-assets/radiators" / photo_name).write_bytes(photo.data)
        source_pages[str(page)] = text
        for height, width, interaxis, codes, weight, water, q50, q30, exponent in rows:
            # Second published code is the central 50 mm connection variant, with identical published output.
            for index, code in enumerate(codes):
                if family == "Claudia interasse 50" and index == 0:
                    continue  # Already present in the legacy Claudia catalog, preserve its ID.
                central = index == 1
                name = "Claudia centrale 50 mm" if family == "Claudia interasse 50" else family + (" centrale 50 mm" if central else "")
                products.append(dict(
                    id="cordivari-range-" + code, manufacturer="Cordivari", family=name,
                    model=f"{name} {height}×{int(width)}", code=code, construction="fixed", visualShape="towel",
                    productPhoto=photo_metadata, exponentMethod="manufacturer", geometryAccuracy="schematic",
                    geometryNote=f"Profondità schematica dal profilo collettore {depth} mm; ingombro installato e supporti nel disegno ufficiale p.{page - 4}.",
                    columns=None, heightMm=height, interaxisMm=50 if central else interaxis,
                    depthMm=depth, pitchMm=width, widthAdditionMm=0, commercialElementCounts=[1],
                    widthNote=f"Prodotto completo: larghezza {int(width)} mm. Interasse orizzontale {'centrale 50 mm' if central else str(int(interaxis)) + ' mm'} verificato tabella/disegno p.{page - 4}. Valvole escluse. Resa della finitura verniciata R01, non cromata.",
                    elementOutputW=q50, referenceDeltaTK=50, elementOutput30W=q30, exponentN=exponent,
                    coefficientKm=None, waterContentL=water if water else None, weightKg=weight,
                    nominalFlowKgh=None, maxPressureBar=pressure, maxTemperatureC=110,
                    connections='1/2" G; centrale 50 mm' if central else '1/2" G',
                    sourceMetadata=dict(manufacturer="Cordivari", sourceUrl=URL, sourceType="pdf",
                                        documentRevision="2025", retrievedAt=now, importedAt=now,
                                        sha256=digest, page=page)))
        print(f"{family}: {len(rows)} taglie")
    assert len({item['id'] for item in products}) == len(products)
    stable = [{**item, "sourceMetadata": {k: v for k, v in item["sourceMetadata"].items() if k not in ("importedAt", "retrievedAt")}} for item in products]
    version = "2026-10-14-cordivari-range-" + hashlib.sha256(json.dumps(stable, sort_keys=True).encode()).hexdigest()[:12]
    catalog = dict(version=version, manufacturer="Cordivari", products=products)
    if "--apply" in sys.argv:
        target = ROOT / "catalog-data/generated/cordivari-range.json"
        if target.exists():
            previous_catalog = json.loads(target.read_text(encoding="utf8"))
            assert previous_catalog["version"] == version, "Existing imported version changed: preserve its history before replacing"
            catalog = previous_catalog
        target.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf8")
        (ROOT / "catalog-data/sources/cordivari-range.pages.json").write_text(json.dumps(source_pages, ensure_ascii=False, indent=2), encoding="utf8")
        # All selected painted families explicitly refer to Color System pp. II–III.
        # Reuse the painted Claudia palette, including its restriction excluding Ardesia transparent F28.
        finish_path = ROOT / "catalog-data/generated/radiator-finishes.json"
        finishes = json.loads(finish_path.read_text(encoding="utf8"))
        painted = next(family for family in finishes["families"] if family["id"] == "cordivari-claudia")
        for family in dict.fromkeys(item["family"] for item in products):
            if family not in painted["aliases"]:
                painted["aliases"].append(family)
        finish_path.write_text(json.dumps(finishes, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print(f"{len(products)} prodotti verificati, {len(FAMILIES)} famiglie")

if __name__ == "__main__":
    main()
