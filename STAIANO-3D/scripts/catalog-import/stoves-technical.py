"""Archive public stove pages and extract only explicitly labelled technical data.

--acquire downloads the current official pages; --apply writes the runtime overlay.
Without either flag, extraction is offline and only writes the audit report.
Existing product identifiers and photo assets remain unchanged.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from decimal import Decimal
from html.parser import HTMLParser
from io import BytesIO
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlparse
import argparse
import hashlib
import json
import os
import re
import time
import unicodedata
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "catalog-data/sources/stoves"
SNAPSHOT = ROOT / "src/domain/catalogs/stoves.json"
OUTPUT = ROOT / "catalog-data/generated/stoves-technical.json"
REPORT = ROOT / ".cache/stoves-technical-audit.json"
CURATED = ROOT / "catalog-data/curation/stoves-technical-sources.json"
HOSTS = {"Ravelli": "ita.ravelligroup.it", "La Nordica Extraflame": "www.lanordica-extraflame.com"}
NUMBER = r"\d+(?:[.,]\d+)?"
RANGE = rf"({NUMBER})(?:\s*[-–]\s*({NUMBER}))?"


class VisibleText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skipped = 0
        self.h1 = False
        self.titles = []
        self.parts = []
        self.active_rows = []
        self.rows = []

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"):
            self.skipped += 1
        if tag == "h1":
            self.h1 = True
        if tag in ("li", "tr") and not self.skipped:
            self.active_rows.append((tag, []))

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript"):
            self.skipped = max(0, self.skipped - 1)
        if tag == "h1":
            self.h1 = False
        for index in range(len(self.active_rows) - 1, -1, -1):
            if self.active_rows[index][0] == tag:
                self.rows.append(" ".join(self.active_rows[index][1]))
                del self.active_rows[index:]
                break

    def handle_data(self, value):
        if not self.skipped:
            self.parts.append(value)
            for _, parts in self.active_rows:
                parts.append(value)
            if self.h1:
                self.titles.append(value)


def identity(value):
    return re.sub(r"[^a-z0-9]", "", unicodedata.normalize("NFKD", value).casefold())


def number(value):
    result = Decimal(value.replace(",", "."))
    if not result.is_finite() or result <= 0:
        raise ValueError("Dato tecnico non positivo")
    return result


def unique(values, label):
    values = set(values)
    if len(values) > 1:
        raise ValueError(f"Valori discordanti per {label}")
    return next(iter(values), None)


def extract(html, name):
    parser = VisibleText()
    parser.feed(html)
    if identity(" ".join(parser.titles)) != identity(name):
        raise ValueError("Titolo del prodotto diverso dal modello archiviato")
    fields = [" ".join(row.split()) for row in parser.rows]
    def matches(pattern):
        for field in fields:
            match = re.match(pattern, field, re.I)
            if match:
                yield match
    triple = rf"({NUMBER})\s*[x×]\s*({NUMBER})\s*[x×]\s*({NUMBER})"
    dimensions = []
    for pattern, order, multiplier in [
        (rf"Dimensioni\s*\(L\s*[x×]\s*H\s*[x×]\s*P\)\s*{triple}\s*mm\b", (0, 1, 2), 1),
        (rf"Dimensioni\s+H\s*[x×]\s*L\s*[x×]\s*P\s*\(cm\)\s*{triple}(?=\s+[A-Za-z]|$)", (1, 0, 2), 10),
    ]:
        for match in matches(pattern):
            dimensions.append(tuple(float(number(match[i + 1]) * multiplier) for i in order))
    size = unique(dimensions, "dimensioni")
    def power_for(label):
        powers = []
        for pattern in [rf"{label}\s*\(kW\)\s*{RANGE}(?=\s+[A-Za-z]|$)", rf"{label}\s+{RANGE}\s*kW\b"]:
            for match in matches(pattern):
                low, high = number(match[1]), number(match[2] or match[1])
                if high < low:
                    raise ValueError("Intervallo di potenza invertito")
                powers.append((float(low * 1000), float(high * 1000)))
        value = unique(powers, label)
        return {"minW": value[0], "maxW": value[1]} if value else None
    # The label gives the unit; match groups distinguish the two publisher layouts.
    weights = []
    for match in matches(rf"Peso\s+Netto\s*(?:\(kg\)\s*({NUMBER})|({NUMBER})\s*kg\b)"):
        weights.append(float(number(match[1] or match[2])))
    flues = []
    for pattern in [rf"Diametro scarico fumi\s*\([^)]*\)\s*({NUMBER})\s*mm\b", rf"Tubo uscita fumi\s*\([^)]*\bmm\)\s*({NUMBER})(?=\s|$)"]:
        flues.extend(float(number(match[1])) for match in matches(pattern))
    return {
        "dimensionsMm": dict(zip(("widthMm", "heightMm", "depthMm"), size)) if size else None,
        "nominalPowerW": power_for(r"Potenza(?:\s+termica)?\s+nominale"),
        "waterPowerW": power_for(r"Potenza\s+(?:(?:resa|nominale)\s+)?all['’]acqua"),
        "partLoadPowerW": None,
        "weightKg": unique(weights, "peso"),
        "flueDiameterMm": unique(flues, "diametro fumi"),
    }


def pdf_data(article, data, curated):
    import pypdf

    if hashlib.sha256(data).hexdigest() != curated["sheetSha256"]:
        raise ValueError("Scheda tecnica diversa dalla revisione validata")
    if len(data) != curated["sheetBytes"] or not data.startswith(b"%PDF-"):
        raise ValueError("Scheda tecnica PDF non valida")
    if article["id"] != curated["articleId"] or article["codice_articolo"] != curated["articleCode"] or article["nome_articolo_mkt"] != "ISETTA CC.165":
        raise ValueError("Record ufficiale di un altro prodotto")
    revision = next((item for item in article["revisioni"] if item["codice"] == curated["revisionCode"]), None)
    if not revision or article["codice_articolo"] + "-001" != revision["codice"]:
        raise ValueError("Revisione del modello non riconosciuta")
    document = revision["scheda_tecnica"]
    if document["name"] != curated["sheetName"] or document["file"] != curated["sheetUrl"]:
        raise ValueError("Il record ufficiale punta a un'altra scheda")
    pages = [page.extract_text() or "" for page in pypdf.PdfReader(BytesIO(data)).pages]
    text = "\n".join(pages)
    if article["nome_articolo_mkt"] not in text:
        raise ValueError("La scheda PDF non riporta il modello")
    dimension_rows = []
    for page in pages:
        for section in re.finditer(r"Dimensioni apparecchio(.*?)(?=Dimensioni bocca fuoco|Dimensioni focolare|$)", page, re.I | re.S):
            dimension_rows.extend(tuple(float(number(value)) for value in row) for row in re.findall(r"W\s*x\s*H\s*x\s*L\s*(\d+)\s*x\s*(\d+)\s*x\s*(\d+)\s*mm\b", section[1], re.I))
    dimensions = unique(dimension_rows, "dimensioni PDF")
    output_rows = []
    for page in pages:
        for match in re.finditer(r"Potenza termica(?:[ \n][^\n]+){0,4}?\s+P\s+(\d+(?:[,.]\d+)?)\s+(\d+(?:[,.]\d+)?)\s*kW\b", page, re.I):
            output_rows.append((float(number(match[1]) * 1000), float(number(match[2]) * 1000)) )
    power = unique(output_rows, "potenze nom e part PDF")
    if not dimensions or dimensions != (revision["dimensioni_nette_l"], float(revision["dimensioni_nette_h"]), revision["dimensioni_nette_p"]):
        raise ValueError("Quote PDF e record ufficiale discordanti")
    if not power or power[0] != revision["potenza_termica_nominale_max"] * 1000:
        raise ValueError("Potenza nominale PDF e record ufficiale discordanti")
    if revision["peso_netto"] not in [float(number(match[1])) for match in re.finditer(r"Peso netto[^\n]{0,140}?\s(\d+(?:[,.]\d+)?)\s*kg\b", "\n".join(pages), re.I)]:
        raise ValueError("Peso PDF e record ufficiale discordanti")
    return {
        "dimensionsMm": dict(zip(("widthMm", "heightMm", "depthMm"), dimensions)),
        "nominalPowerW": {"minW": power[0], "maxW": power[0]},
        "partLoadPowerW": power[1],
        "waterPowerW": None,
        "weightKg": revision["peso_netto"],
        "flueDiameterMm": revision["diametro_scarico_fumi_o"],
    }


def record_download(url, host, filename, mime, *, expected_sha=None, max_bytes=30 * 1024 * 1024):
    if urlparse(url).scheme != "https" or urlparse(url).hostname != host:
        raise ValueError("Fonte del produttore non valida")
    request = urllib.request.Request(url, headers={"User-Agent": "StaianoHVAC-CatalogImporter/0.1"})
    with urllib.request.urlopen(request, timeout=35) as response:
        if urlparse(response.url).hostname != host:
            raise ValueError("Il download esce dal sito del produttore")
        data = response.read(max_bytes + 1)
        if len(data) > max_bytes:
            raise ValueError("Documento oltre il limite previsto")
        if mime not in response.headers.get("Content-Type", ""):
            raise ValueError("Formato della fonte non valido")
    sha = hashlib.sha256(data).hexdigest()
    if expected_sha and sha != expected_sha:
        raise ValueError("La fonte tecnica è cambiata: aggiornamento manuale richiesto")
    (SOURCE / filename).write_bytes(data)
    return {"name": filename, "sourceUrl": url, "finalUrl": response.url, "sha256": sha}


def pdf_dimensions(data, sheet):
    import pypdf

    if len(data) != sheet["bytes"] or hashlib.sha256(data).hexdigest() != sheet["sha256"]:
        raise ValueError("Scheda dimensionale diversa dalla revisione validata")
    text = " ".join((pypdf.PdfReader(BytesIO(data)).pages[sheet["page"] - 1].extract_text() or "").split())
    if not re.search(rf"\b{re.escape(sheet['model'])}\b", text, re.I):
        raise ValueError("Scheda dimensionale di un altro modello")
    match = re.search(rf"Dimensioni d['’]ingombro H\s*x\s*L\s*x\s*P.*?\bmm\s+({NUMBER})\s*x\s*({NUMBER})\s*x\s*({NUMBER})\b", text, re.I)
    dimensions = dict(zip(("heightMm", "widthMm", "depthMm"), (float(number(v)) for v in match.groups()))) if match else None
    if dimensions != sheet["dimensionsMm"]:
        raise ValueError("Quote della scheda dimensionale discordanti")
    return dimensions


def acquire(product):
    curated = json.loads(CURATED.read_text(encoding="utf8"))["products"].get(product["id"])
    if curated:
        api = record_download(curated["articleUrl"], "www.lanordica-extraflame.com", f"{product['id']}-article.json", "application/json", expected_sha=curated["articleSha256"], max_bytes=2 * 1024 * 1024)
        article = json.loads((SOURCE / api["name"]).read_bytes())
        if len(article) != 1:
            raise ValueError("Record articolo ufficiale ambiguo")
        revision = next((row for row in article[0]["revisioni"] if row["codice"] == curated["revisionCode"]), None)
        if article[0]["id"] != curated["articleId"] or article[0]["codice_articolo"] != curated["articleCode"] or article[0]["nome_articolo_mkt"] != product["name"] or not revision:
            raise ValueError("Record ufficiale non corrisponde al modello in catalogo")
        sheet = revision["scheda_tecnica"]
        if sheet["name"] != curated["sheetName"] or sheet["file"] != curated["sheetUrl"]:
            raise ValueError("La revisione pubblicata punta a una scheda diversa")
        pdf = record_download(sheet["file"], "storage.onpage.it", sheet["name"], "application/pdf", expected_sha=curated["sheetSha256"], max_bytes=6 * 1024 * 1024)
        page = record_download(product["sourceUrl"], HOSTS[product["brand"]], f"{product['id']}-article-page.html", "text/html")
        return {"id": product["id"], "type": "official-api-and-pdf", "article": api, "pdf": pdf, "productPage": page, "retrievedAt": datetime.now(timezone.utc).isoformat()}
    url = product["sourceUrl"]
    expected_host = HOSTS[product["brand"]]
    if urlparse(url).scheme != "https" or urlparse(url).hostname != expected_host:
        raise ValueError("Fonte del produttore non valida")
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "StaianoHVAC-CatalogImporter/0.1"})
            with urllib.request.urlopen(request, timeout=35) as response:
                if urlparse(response.url).hostname != expected_host:
                    raise ValueError("Il download esce dal sito del produttore")
                data = response.read(30 * 1024 * 1024 + 1)
                if len(data) > 30 * 1024 * 1024:
                    raise ValueError("Pagina oltre 30 MB")
                if "text/html" not in response.headers.get("Content-Type", ""):
                    raise ValueError("La fonte non è HTML")
            break
        except HTTPError as error:
            if error.code not in (408, 429, 500, 502, 503, 504) or attempt == 2:
                raise
            time.sleep(min(10, 2 ** attempt))
    sha = hashlib.sha256(data).hexdigest()
    filename = f"{product['id']}-{sha}.html"
    (SOURCE / filename).write_bytes(data)
    dimension_sheet = json.loads(CURATED.read_text(encoding="utf8")).get("dimensionSheets", {}).get(product["id"])
    if dimension_sheet:
        record_download(dimension_sheet["sourceUrl"], expected_host, dimension_sheet["name"], "application/pdf", expected_sha=dimension_sheet["sha256"])
    return {"id": product["id"], "name": filename, "sourceUrl": url, "sha256": sha, "retrievedAt": datetime.now(timezone.utc).isoformat(), "historicalHashMatches": sha == product["sourceSha256"]}


def main():
    arguments = argparse.ArgumentParser(description=__doc__)
    arguments.add_argument("--acquire", action="store_true")
    arguments.add_argument("--apply", action="store_true")
    args = arguments.parse_args()
    products = json.loads(SNAPSHOT.read_text(encoding="utf8"))["products"]
    manifest_file = SOURCE / "manifest.json"
    curation = json.loads(CURATED.read_text(encoding="utf8"))
    curated_products = curation["products"]
    if args.acquire:
        SOURCE.mkdir(parents=True, exist_ok=True)
        records = []
        with ThreadPoolExecutor(max_workers=4) as pool:
            jobs = {pool.submit(acquire, product): product for product in products}
            for job in as_completed(jobs):
                product = jobs[job]
                try:
                    records.append(job.result())
                except Exception as error:
                    records.append({"id": product["id"], "error": str(error)})
                if len(records) % 10 == 0:
                    print(f"Acquisite {len(records)}/{len(products)} pagine", flush=True)
        staging_file = manifest_file.with_suffix(".staging.json")
        staging_file.write_text(json.dumps(sorted(records, key=lambda row: row["id"]), ensure_ascii=False, indent=2) + "\n", encoding="utf8")
        os.replace(staging_file, manifest_file)
    sources = {row["id"]: row for row in json.loads(manifest_file.read_text(encoding="utf8"))}
    verified, failures = [], []
    for product in products:
        source = sources.get(product["id"], {})
        if product["id"] in curated_products and source.get("type") == "official-api-and-pdf":
            try:
                api_bytes = (SOURCE / source["article"]["name"]).read_bytes()
                pdf_bytes = (SOURCE / source["pdf"]["name"]).read_bytes()
                if hashlib.sha256(api_bytes).hexdigest() != source["article"]["sha256"]:
                    raise ValueError("Record articolo diverso dallo SHA-256 acquisito")
                articles = json.loads(api_bytes)
                if len(articles) != 1:
                    raise ValueError("Record articolo ambiguo")
                article, curated = articles[0], curated_products[product["id"]]
                if article["codice_articolo"] != curated["articleCode"] or article["nome_articolo_mkt"] != product["name"]:
                    raise ValueError("Record ufficiale non corrisponde al modello del catalogo")
                values = pdf_data(article, pdf_bytes, curated)
                retrieved = source["retrievedAt"]
                pdf_meta = {"manufacturer": product["brand"], "sourceUrl": source["pdf"]["sourceUrl"], "sourceType": "pdf", "documentRevision": curated["revisionCode"], "retrievedAt": retrieved, "importedAt": retrieved, "sha256": source["pdf"]["sha256"], "page": 4}
                values["sourceMetadata"] = pdf_meta
                values["supportingSources"] = [
                    {"sourceMetadata": {"manufacturer": product["brand"], "sourceUrl": source["article"]["sourceUrl"], "sourceType": "json", "documentRevision": curated["revisionCode"], "retrievedAt": retrieved, "importedAt": retrieved, "sha256": source["article"]["sha256"], "page": None}},
                    {"sourceMetadata": {**pdf_meta, "page": 1}},
                    {"sourceMetadata": {"manufacturer": product["brand"], "sourceUrl": source["productPage"]["sourceUrl"], "sourceType": "html", "documentRevision": None, "retrievedAt": retrieved, "importedAt": retrieved, "sha256": source["productPage"]["sha256"], "page": None}},
                ]
                values["articleCode"] = article["codice_articolo"]
                values["imageAssetSku"] = re.search(r"\((\d+)\)", product["remotePhoto"] or "").group(1) if re.search(r"\((\d+)\)", product["remotePhoto"] or "") else None
                verified.append({"id": product["id"], **values})
            except Exception as error:
                failures.append({"id": product["id"], "error": str(error)})
            continue
        try:
            source = sources[product["id"]]
            if "error" in source:
                raise ValueError(source["error"])
            data = (SOURCE / source["name"]).read_bytes()
            if hashlib.sha256(data).hexdigest() != source["sha256"]:
                raise ValueError("Documento locale diverso dallo SHA-256 acquisito")
            values = extract(data.decode("utf8"), product["name"])
            retrieved = source["retrievedAt"]
            supporting = []
            sheet = curation.get("dimensionSheets", {}).get(product["id"])
            if sheet:
                # The published HTML incorrectly labels these millimetre values as cm.
                values["dimensionsMm"] = pdf_dimensions((SOURCE / sheet["name"]).read_bytes(), sheet)
                supporting.append({"sourceMetadata": {"manufacturer": product["brand"], "sourceUrl": sheet["sourceUrl"], "sourceType": "pdf", "documentRevision": None, "retrievedAt": sheet["retrievedAt"], "importedAt": sheet["retrievedAt"], "sha256": sheet["sha256"], "page": sheet["page"]}})
            verified.append({"id": product["id"], **values, "sourceMetadata": {"manufacturer": product["brand"], "sourceUrl": source["sourceUrl"], "sourceType": "html", "documentRevision": None, "retrievedAt": retrieved, "importedAt": retrieved, "sha256": source["sha256"], "page": None}, "supportingSources": supporting})
        except Exception as error:
            failures.append({"id": product["id"], "error": str(error)})
    report = {"models": len(products), "verifiedProducts": len(verified), "withDimensions": sum(row["dimensionsMm"] is not None for row in verified), "withNominalPower": sum(row["nominalPowerW"] is not None for row in verified), "withWaterPower": sum(row["waterPowerW"] is not None for row in verified), "sourceFormats": {"html": sum(row["sourceMetadata"]["sourceType"] == "html" for row in verified), "pdf": sum(row["sourceMetadata"]["sourceType"] == "pdf" for row in verified)}, "failures": failures, "missingDimensions": [row["id"] for row in verified if row["dimensionsMm"] is None], "missingNominalPower": [row["id"] for row in verified if row["nominalPowerW"] is None]}
    REPORT.parent.mkdir(exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    if args.apply and failures:
        raise SystemExit("Catalogo tecnico stufe non applicato: alcune fonti devono essere riesaminate.")
    if args.apply:
        OUTPUT.write_text(json.dumps({"version": 1, "products": verified}, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print(json.dumps(report, ensure_ascii=True), flush=True)


if __name__ == "__main__":
    main()
