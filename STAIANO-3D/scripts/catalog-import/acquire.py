"""Download official, versioned source documents; extract text without OCR/AI.

Developer tooling only. Requires pdfplumber (MIT). Never used by app runtime.
"""
import hashlib
import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
import pdfplumber

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / "catalog-data" / "sources"
DEST.mkdir(parents=True, exist_ok=True)

def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": "StaianoHVAC-CatalogImporter/0.1"})
    with urllib.request.urlopen(request, timeout=35) as response:
        if response.length and response.length > 30 * 1024 * 1024:
            raise ValueError("Source exceeds 30 MB")
        data = response.read(30 * 1024 * 1024 + 1)
        if len(data) > 30 * 1024 * 1024:
            raise ValueError("Source exceeds 30 MB")
        return data

sources = {
    "global-vip-certificate": "https://www.globalradiatori.it/download/Prodotti/cert_res_vip_ita.pdf",
    "global-oscar-certificate": "https://www.globalradiatori.it/download/Prodotti/cert_res_oscar_ita.pdf",
    "global-listino-2026": "https://www.globalradiatori.it/download/listino/ListinoIT_giugno26.pdf",
    "global-vip-technical": "https://www.globalradiatori.it/uploads/blog/00231_17116211450.pdf",
    "global-oscar-technical": "https://www.globalradiatori.it/uploads/blog/00232_17447968780.pdf",
}
for columns in range(2, 7):
    page_url = f"https://www.cordivari.it/prodotto/radiatore-tubolare-ardesia-{columns}-colonne/"
    html = fetch(page_url).decode("utf-8", errors="replace")
    urls = list(dict.fromkeys(re.findall(r'https://www\.cordivari\.it/[^\s"<>]+\.pdf', html)))
    matching = [u for u in urls if re.search(fr"ardesia[-_ ]{columns}[-_ ]colonne", u, re.I) and not re.search(r"sost|allacc", u, re.I)]
    if not matching:
        raise ValueError(f"Official technical PDF not found on {page_url}; review publisher layout")
    sources[f"cordivari-ardesia-{columns}"] = matching[0]

manifest = []
for name, url in sources.items():
    data = fetch(url)
    if not data.startswith(b"%PDF-"):
        raise ValueError(f"Invalid PDF source: {url}")
    pdf_path = DEST / f"{name}.pdf"
    if pdf_path.exists() and pdf_path.read_bytes() != data:
        (DEST / f"{name}.previous.pdf").write_bytes(pdf_path.read_bytes())
    pdf_path.write_bytes(data)
    with pdfplumber.open(pdf_path) as pdf:
        pages = [page.extract_text(x_tolerance=1, y_tolerance=3) or "" for page in pdf.pages]
    (DEST / f"{name}.txt").write_text("\n\n".join(pages), encoding="utf-8")
    manifest.append({"name": name, "sourceUrl": url, "sourceType": "pdf", "retrievedAt": datetime.now(timezone.utc).isoformat(), "sha256": hashlib.sha256(data).hexdigest(), "pageCount": len(pages)})
    print(f"{name}: {len(pages)} pages, {len(data)} bytes")
(DEST / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
