"""Archive every product in four official terminal categories, without OCR.

This is an explicit online maintenance command. Runtime uses generated local data.
Legacy discovery.json remains untouched to preserve historical source revisions.
"""
import concurrent.futures
import hashlib
import json
import re
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse, quote
import pdfplumber

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / "catalog-data/sources/ecoclima"
BASE = "https://www.ecoclima.com"
CATEGORIES = ["diffusione/diffusori", "diffusione/bocchette", "diffusione/griglie", "vmc-ventilazione-meccanica-controllata/bocchette-griglie-e-plenum"]

class Links(HTMLParser):
    def __init__(self):
        super().__init__(); self.links = []; self.anchor = None; self.text = []; self.images = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "a": self.anchor = a.get("href"); self.text = []
        if tag == "img": self.images.append((a.get("src", ""), a.get("alt", "")))
    def handle_data(self, data):
        if self.anchor: self.text.append(data)
    def handle_endtag(self, tag):
        if tag == "a" and self.anchor:
            self.links.append((self.anchor, " ".join(self.text).strip())); self.anchor = None

def fetch(url):
    if urlparse(url).hostname != "www.ecoclima.com": raise ValueError("Non-primary URL")
    with urllib.request.urlopen(urllib.request.Request(quote(url, safe=":/?%=&"), headers={"User-Agent": "StaianoHVAC-CatalogImporter/0.1"}), timeout=45) as response:
        data = response.read(30 * 1024 * 1024 + 1)
        if len(data) > 30 * 1024 * 1024: raise ValueError("Source too large")
        return data

def save_source(url, filename, label):
    path = DEST / filename
    data = path.read_bytes() if path.exists() else fetch(url)
    path.write_bytes(data)
    return {"filename": filename, "sourceUrl": url, "label": label, "retrievedAt": datetime.now(timezone.utc).isoformat(), "sha256": hashlib.sha256(data).hexdigest()}

def acquire(item):
    url, label, categories = item
    code = re.match(r"^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*", label)[0]
    prefix = "complete-" + code.lower() + "-" + hashlib.sha256(url.encode()).hexdigest()[:8]
    record = {"code": code, "name": label, "pageUrl": url, "categories": categories, "documents": [], "images": [], "errors": []}
    try:
        record["htmlSource"] = save_source(url, prefix + ".html", label)
        parser = Links(); parser.feed((DEST / (prefix + ".html")).read_text(encoding="utf8"))
        documents = dict((urljoin(BASE, href), name) for href, name in parser.links if re.search(r"\.(pdf|xlsx?|csv)(?:$|\?)", href, re.I))
        for index, (document, name) in enumerate(documents.items()):
            # Original PDF attachments include technical drawings omitted by HTML.
            if "prezz" in name.lower(): continue
            try:
                extension = ".pdf" if ".pdf" in document.lower() else Path(urlparse(document).path).suffix
                source = save_source(document, prefix + f"-{index}" + extension, name)
                record["documents"].append(source)
                if extension == ".pdf":
                    with pdfplumber.open(DEST / source["filename"]) as pdf:
                        text = [p.extract_text(x_tolerance=1, y_tolerance=3) or "" for p in pdf.pages]
                    (DEST / source["filename"]).with_suffix(".txt").write_text("\n\n".join(text), encoding="utf8")
                    source["pageCount"] = len(text)
            except Exception as error: record["errors"].append({"sourceUrl": document, "error": str(error)})
        for image_url, alt in parser.images:
            if "550_550" not in image_url: continue
            image_url = urljoin(BASE, image_url)
            try:
                filename = prefix + "-image" + Path(urlparse(image_url).path).suffix
                source = save_source(image_url, filename, alt)
                target = ROOT / "public/catalog" / filename
                target.write_bytes((DEST / filename).read_bytes())
                source["path"] = "/catalog/" + filename
                record["images"].append(source)
                break
            except Exception as error: record["errors"].append({"sourceUrl": image_url, "error": str(error)})
    except Exception as error: record["errors"].append({"sourceUrl": url, "error": str(error)})
    print(code, len(record["documents"]), len(record["errors"]), flush=True)
    return record

if __name__ == "__main__":
    pages = {}; categories = []
    for category in CATEGORIES:
        url = BASE + "/catalogo-generale/" + category
        source = save_source(url, "complete-category-" + category.replace("/", "-") + ".html", category)
        parser = Links(); parser.feed((DEST / source["filename"]).read_text(encoding="utf8"))
        urls = set()
        for href, label in parser.links:
            href = urljoin(BASE, href)
            if not href.startswith(url + "/") or not re.match(r"^[A-Z][A-Z0-9]+(?:-|\s)", label): continue
            if href not in pages: pages[href] = [href, label, []]
            if category not in pages[href][2]: pages[href][2].append(category)
            urls.add(href)
        source["productPageCount"] = len(urls); categories.append(source)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        records = list(pool.map(acquire, pages.values()))
    (DEST / "complete-discovery.json").write_text(json.dumps({"categories": categories, "records": records}, indent=2, ensure_ascii=False), encoding="utf8")
    print("Official product pages:", len(records), flush=True)
