"""Acquire official LG split-system documents and record their exact hashes."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys
import urllib.request

import pdfplumber

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / "catalog-data" / "sources" / "splits"
DEST.mkdir(parents=True, exist_ok=True)
SOURCES = {
    "lg-round": "https://www.lg.com/gr/business/download/airsolution/Single_Split_Round_Cassette_Leaflet%5B20230321_193842507%5D.pdf",
    "lg-multi": "https://www.lg.com/gr/business/download/airsolution/Multi_Split_Leaflet%5B20210524_181956643%5D.pdf",
}


def acquire():
    manifest_path = DEST / "lg-manifest.json"
    previous = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else []
    manifest = []
    for name, url in SOURCES.items():
        if "--round-only" in sys.argv and name != "lg-round":
            continue
        path = DEST / f"{name}.pdf"
        cached = path.exists() and "--refresh" not in sys.argv
        if not cached:
            request = urllib.request.Request(
                url,
                headers={"User-Agent": "Mozilla/5.0 StaianoHVAC-CatalogImporter/0.2"},
            )
            with urllib.request.urlopen(request, timeout=60) as response:
                data = response.read(200 * 1024 * 1024 + 1)
            if len(data) > 200 * 1024 * 1024:
                raise ValueError(f"Source exceeds 200 MB: {url}")
            if b"%PDF-" not in data[:1024]:
                raise ValueError(f"Not a PDF: {url}")
            path.write_bytes(data)
        data = path.read_bytes()
        if b"%PDF-" not in data[:1024]:
            raise ValueError(f"Not a PDF: {path}")
        with pdfplumber.open(path) as pdf:
            pages = [page.extract_text(x_tolerance=1, y_tolerance=3) or "" for page in pdf.pages]
        path.with_suffix(".pages.json").write_text(
            json.dumps(pages, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        path.with_suffix(".txt").write_text("\n\n".join(pages), encoding="utf-8")
        digest = hashlib.sha256(data).hexdigest().upper()
        old = next((item for item in previous if item["name"] == name and item["sha256"] == digest), None)
        manifest.append({
            "name": name,
            "sourceUrl": url,
            "sourceType": "pdf",
            "sha256": digest,
            "retrievedAt": old["retrievedAt"] if cached and old else datetime.now(timezone.utc).isoformat(),
            "pageCount": len(pages),
        })
        print(f"{name}: {len(pages)} pages, {len(data)} bytes, sha256 {digest}")
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    acquire()
