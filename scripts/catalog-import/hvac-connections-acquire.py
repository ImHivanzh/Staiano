"""Acquire manufacturer outlet drawings, preserving provenance for unchanged cached bytes."""
import hashlib
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
import pdfplumber

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / 'catalog-data/sources/hvac'
DEST.mkdir(parents=True, exist_ok=True)
SOURCES = {
    'mitsubishi-pead-dimensions': 'https://library.mitsubishielectric.co.uk/pdf/download_full/4173',
    'gree-duct-installation': 'https://gree.gr/wp-content/uploads/2025/07/IM_U-Match-Duct.pdf',
    'daikin-fba100-140-dimensions': 'https://www.daikin.es/content/dam/MDM/TechnicalDrawings/SkyAir/FBA-A/EN/fba100-140a_dim_3d094914b_en.pdf',
}
for model, drawing in [('35', '094988'), ('50', '094918'), ('60', '094983'), ('71', '094915')]:
    SOURCES['daikin-fba'+model+'-dimensions'] = f'https://www.daikin.es/content/dam/MDM/TechnicalDrawings/SkyAir/FBA-A(9)/fba{model}a9_dim_3d{drawing}b_en.pdf'
manifest_path = DEST / 'connections-manifest.json'
previous = {entry['name']: entry for entry in json.loads(manifest_path.read_text(encoding='utf8'))} if manifest_path.exists() else {}
manifest = []
for name, url in SOURCES.items():
    source_path = DEST / (name + '.pdf')
    cached = source_path.exists() and '--refresh' not in sys.argv
    if cached:
        data = source_path.read_bytes()
    else:
        request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 StaianoHVAC-CatalogImporter/0.2'})
        with urllib.request.urlopen(request, timeout=45) as response:
            data = response.read(100 * 1024 * 1024 + 1)
        if len(data) > 100 * 1024 * 1024:
            raise ValueError(f'PDF exceeds100MB: {name}')
    if not data.startswith(b'%PDF-'):
        raise ValueError(f'Not a PDF: {name}')
    source_path.write_bytes(data)
    with pdfplumber.open(source_path) as pdf:
        pages = [page.extract_text() or '' for page in pdf.pages]
    source_path.with_suffix('.pages.json').write_text(json.dumps(pages, ensure_ascii=False), encoding='utf8')
    source_path.with_suffix('.txt').write_text('\n\n'.join(pages), encoding='utf8')
    sha256 = hashlib.sha256(data).hexdigest()
    old = previous.get(name)
    retrieved = old['retrievedAt'] if cached and old and old['sha256'] == sha256 else datetime.now(timezone.utc).isoformat()
    manifest.append(dict(name=name, sourceUrl=url, sourceType='pdf', retrievedAt=retrieved, sha256=sha256, pageCount=len(pages)))
    print(name, len(pages), 'pages', sha256)
# A failed source aborts before manifest publication; do not lose previously verified entries.
manifest_path.write_text(json.dumps(manifest, indent=2), encoding='utf8')
