"""Discover only official public Ecoclima technical sources; no account or OCR."""
import hashlib
import json
import re
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin
import pdfplumber

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / "catalog-data" / "sources" / "ecoclima"
DEST.mkdir(parents=True, exist_ok=True)
class Links(HTMLParser):
    def __init__(self):
        super().__init__(); self.links=[]; self.anchor=None; self.text=[]
    def handle_starttag(self, tag, attrs):
        if tag == "a": self.anchor=dict(attrs).get("href"); self.text=[]
    def handle_data(self, data):
        if self.anchor: self.text.append(data)
    def handle_endtag(self, tag):
        if tag == "a" and self.anchor:
            self.links.append((self.anchor, " ".join(self.text).strip())); self.anchor=None
def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent":"StaianoHVAC-CatalogImporter/0.1"}), timeout=35) as response:
        data=response.read(30*1024*1024+1)
        if len(data)>30*1024*1024: raise ValueError("Source too large")
        return data
BASE="https://www.ecoclima.com"
categories=["/catalogo-generale/diffusione/diffusori", "/catalogo-generale/diffusione/bocchette", "/catalogo-generale/diffusione/griglie", "/catalogo-generale/vmc-ventilazione-meccanica-controllata/bocchette-griglie-e-plenum"]
pages={}
for category in categories:
    parser=Links(); parser.feed(fetch(BASE+category).decode("utf8"))
    for href,label in parser.links:
        if re.match(r"^(EDLS|EBLF|EADD|EGS|EGQ|ETA|EVVMC|EVVMB)(?:\s|\b)",label): pages[urljoin(BASE,href)]=label
records=[]
for url,label in pages.items():
    code=re.match(r"^[A-Z]+",label)[0]
    prefix=code+"-"+hashlib.sha256(url.encode()).hexdigest()[:8]
    html=fetch(url).decode("utf8"); (DEST/(prefix+".html")).write_text(html,encoding="utf8")
    parser=Links(); parser.feed(html)
    documents=[(urljoin(BASE,href),name) for href,name in parser.links if re.search(r"\.(pdf|xlsx?|csv)(?:$|\?)",href,re.I)]
    record={"code":code,"name":label,"pageUrl":url,"documents":[]}
    for index,(document,name) in enumerate(dict(documents).items()):
        if "scheda" not in name.lower() or "prezz" in name.lower(): continue
        data=fetch(document)
        if not data.startswith(b"%PDF-"): continue
        path=DEST/(prefix+f"-{index}.pdf"); path.write_bytes(data)
        with pdfplumber.open(path) as pdf:
            text=[page.extract_text(x_tolerance=1,y_tolerance=3) or "" for page in pdf.pages]
        path.with_suffix(".txt").write_text("\n\n".join(text),encoding="utf8")
        record["documents"].append({"filename":path.name,"label":name,"sourceUrl":document,"retrievedAt":datetime.now(timezone.utc).isoformat(),"sha256":hashlib.sha256(data).hexdigest(),"pageCount":len(text)})
    records.append(record); print(code,len(record["documents"]),url)
(DEST/"discovery.json").write_text(json.dumps(records,indent=2,ensure_ascii=False),encoding="utf8")
