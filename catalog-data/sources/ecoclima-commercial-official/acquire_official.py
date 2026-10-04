"""Archive official Ecoclima commercial downloads without altering source workbooks."""
import concurrent.futures
import datetime
import hashlib
import html
import json
from pathlib import Path
import re
import urllib.request

import openpyxl

ROOT = Path(__file__).resolve().parent
EXISTING = ROOT.parent / "ecoclima"
ORIGIN = "https://www.ecoclima.com"


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, default=str) + "\n", encoding="utf-8")


def immutable_snapshot(filename, data):
    """Keep each content revision before updating a convenience filename."""
    sha256 = hashlib.sha256(data).hexdigest()
    path = Path(filename)
    relative = Path("revisions") / f"{path.stem}-{sha256}{path.suffix}"
    destination = ROOT / relative
    destination.parent.mkdir(exist_ok=True)
    if destination.exists():
        if destination.read_bytes() != data:
            raise ValueError("Immutable source revision collision")
    else:
        destination.write_bytes(data)
    return relative.as_posix()


def archive(url, filename):
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 source-archive"})
    with urllib.request.urlopen(request, timeout=45) as response:
        data = response.read(64 * 1024 * 1024)
        metadata = {"url": url, "finalUrl": response.url, "status": response.status,
                    "headers": dict(response.headers), "retrievedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    "filename": filename, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
    stable = ROOT / filename
    if stable.exists():
        immutable_snapshot(filename, stable.read_bytes())
    metadata["immutableFilename"] = immutable_snapshot(filename, data)
    stable.write_bytes(data)
    return metadata


def extract_workbook(path):
    workbook = openpyxl.load_workbook(path, data_only=False)
    sheets = []
    for sheet in workbook:
        rows, cells = [], []
        for row in sheet:
            if not any(cell.value is not None for cell in row):
                continue
            rows.append({"row": row[0].row, "values": [cell.value for cell in row]})
            cells.extend({"coordinate": cell.coordinate, "row": cell.row, "column": cell.column,
                          "value": cell.value, "type": cell.data_type, "numberFormat": cell.number_format}
                         for cell in row if cell.value is not None)
        sheets.append({"title": sheet.title, "maxRow": sheet.max_row, "maxColumn": sheet.max_column,
                       "mergedRanges": [str(item) for item in sheet.merged_cells.ranges], "rows": rows, "cells": cells})
    extracted = {"filename": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                 "properties": {"title": workbook.properties.title, "creator": workbook.properties.creator,
                                "created": workbook.properties.created, "modified": workbook.properties.modified},
                 "sheets": sheets}
    write_json(path.with_suffix(".cells.json"), extracted)
    return {"sheets": len(sheets), "populatedCells": sum(len(sheet["cells"]) for sheet in sheets)}


def inventory():
    urls = set()
    for path in EXISTING.glob("complete-category-*.html"):
        for url in re.findall(r'href=[\"\']([^\"\']+)', path.read_text(encoding="utf-8")):
            url = html.unescape(url)
            if re.match(r'https://www\.ecoclima\.com/catalogo-generale/(diffusione/(diffusori|bocchette|griglie)|vmc-ventilazione-meccanica-controllata/bocchette-griglie-e-plenum)/[^/]+$', url):
                urls.add(url)
    return sorted(urls, key=lambda url: (not any(code in url for code in ("edls-edlsb", "edsc-c", "ega-push")), url))


def acquire_family(page_url):
    relative = page_url.split("/catalogo-generale/", 1)[1]
    slug = relative.rsplit("/", 1)[-1]
    identity = hashlib.sha256(page_url.encode()).hexdigest()[:8]
    code = slug.split("-", 1)[0].upper()
    filename = f"{code}-{identity}.xlsx"
    result = {"pageUrl": page_url, "code": code, "slug": slug, "sources": []}
    try:
        metadata = archive(f"{ORIGIN}/download/xlsx/{relative}?locale=it", filename)
        if not (ROOT / filename).read_bytes().startswith(b"PK"):
            raise ValueError("Download is not an XLSX archive")
        metadata["extraction"] = extract_workbook(ROOT / filename)
        result["sources"].append(metadata)
        if any(key in slug for key in ("edls-edlsb", "edsc-c", "ega-push")):
            result["sources"].append(archive(f"{ORIGIN}/download/pdf/{relative}?locale=it", f"{code}-{identity}.pdf"))
    except Exception as error:
        result["error"] = str(error)
    write_json(ROOT / f"{code}-{identity}.metadata.json", result)
    print(json.dumps({"code": code, "slug": slug, "ok": "error" not in result}, ensure_ascii=False), flush=True)
    return result


if __name__ == "__main__":
    if (ROOT / "EDLS.xlsx").exists():
        extract_workbook(ROOT / "EDLS.xlsx")
    urls = inventory()
    write_json(ROOT / "page-paths.json", urls)
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for result in pool.map(acquire_family, urls):
            results.append(result)
            write_json(ROOT / "manifest.json", {"authority": ORIGIN, "catalogPriceListRevision": "15-2026",
                      "revisionEvidence": "catalogo-generale.html", "families": results})
    print(json.dumps({"families": len(results), "success": sum("error" not in row for row in results)}, ensure_ascii=False))
