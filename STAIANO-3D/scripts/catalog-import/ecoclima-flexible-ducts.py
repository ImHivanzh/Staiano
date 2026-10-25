"""Extract the published Ecoclima ETF10 specification from its archived PDF."""
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import re

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT / "catalog-data/sources/ecoclima"
OUTPUT = ROOT / "catalog-data/generated/flexible-ducts.json"
SOURCE_URL = "https://www.ecoclima.com/attach/Scheda%20tecnica%20ETF10%20rev%201-2024/attachment-translations/scheda-tecnica-et-f10-rev-1-2024_it.pdf"


def number(value):
    return float(value.replace(",", "."))


def extract_pressure_losses(page):
    cells = []

    def visit(text, _cm, tm, _font, _size):
        value = text.strip()
        if re.fullmatch(r"\d+(?:,\d+)?", value):
            cells.append((round(tm[4], 1), round(tm[5], 1), value))

    page.extract_text(visitor_text=visit)
    rows = {}
    for x, y, value in cells:
        rows.setdefault(y, []).append((x, value))

    headers = next(
        row for y, row in rows.items()
        if y > 740 and len(row) >= 15
    )
    diameters = [(number(value), x) for x, value in headers]
    losses = []
    for y, row in rows.items():
        flow_cells = [value for x, value in row if x < 100 and y < 740]
        if len(flow_cells) != 1:
            continue
        airflow = number(flow_cells[0])
        for x, value in row:
            if x < 100:
                continue
            diameter = min(diameters, key=lambda item: abs(item[1] - x))[0]
            losses.append({
                "diameterMm": diameter,
                "airflowM3h": airflow,
                "pressureDropPaM": number(value),
            })
    return sorted(losses, key=lambda item: (item["diameterMm"], item["airflowM3h"]))


def build_catalog(source_path):
    reader = PdfReader(str(source_path))
    if len(reader.pages) != 2:
        raise ValueError(f"ETF10 technical sheet must have 2 pages: {len(reader.pages)}")
    text = " ".join((page.extract_text() or "") for page in reader.pages)
    if "AGGIORNAMENTO 01/2024" not in text or "ETF10" not in text:
        raise ValueError("Unrecognized Ecoclima ETF10 source revision")

    dimensions_text = re.search(r"Diametri di produzione:\s*(\d[\d\s-]+)\s+Temperatura", text)
    dimensions = [int(value) for value in re.findall(r"\d+", dimensions_text[1])] if dimensions_text else []
    if not dimensions:
        dimensions = sorted({int(item["diameterMm"]) for item in extract_pressure_losses(reader.pages[1])})
    metadata = {
        "manufacturer": "Ecoclima",
        "sourceUrl": SOURCE_URL,
        "sourceType": "pdf",
        "documentRevision": "01/2024",
        "retrievedAt": datetime.now(timezone.utc).isoformat(),
        "importedAt": datetime.now(timezone.utc).isoformat(),
        "sha256": sha256(source_path.read_bytes()).hexdigest(),
        "page": 1,
    }
    product = {
        "id": "ecoclima-etf10",
        "familyCode": "ETF10",
        "diametersMm": dimensions,
        "minimumBendRadiusFactor": 0.6,
        "maxAirVelocityMs": 20,
        "maxPressurePa": 2000,
        "standardLengthM": 10,
        "supportSpacingMm": None,
        "pressureLosses": extract_pressure_losses(reader.pages[1]),
        "sourceMetadata": metadata,
    }
    return {
        "version": f"ecoclima-flexible-ducts-{metadata['sha256'][:12]}",
        "products": [product],
    }


def main():
    sources = sorted(SOURCE_DIR.glob("etf10-*.pdf"))
    if len(sources) != 1:
        raise ValueError(f"Expected one archived ETF10 PDF, found {len(sources)}")
    catalog = build_catalog(sources[0])
    OUTPUT.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "products": len(catalog["products"]),
        "diameters": len(catalog["products"][0]["diametersMm"]),
        "pressureLossRows": len(catalog["products"][0]["pressureLosses"]),
        "revision": catalog["products"][0]["sourceMetadata"]["documentRevision"],
    }))


if __name__ == "__main__":
    main()
