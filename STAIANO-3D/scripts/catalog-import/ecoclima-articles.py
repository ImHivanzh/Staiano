"""Archive the public price-popup identities, matched by the existing price normalizer."""
import concurrent.futures
import datetime as dt
import hashlib
import importlib.util
import json
from pathlib import Path
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "catalog-data/sources/ecoclima"
CACHE = SOURCE / "articles"


def module(filename):
    spec = importlib.util.spec_from_file_location(filename, Path(__file__).with_name(filename))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


grid_module = module("ecoclima-html-grid.py")
normalizer = module("ecoclima-price-workbooks.py")


class ArticleGrid(grid_module.GridParser):
    def handle_starttag(self, tag, attrs):
        super().handle_starttag(tag, attrs)
        attrs = dict(attrs)
        if tag == "a" and self.cell is not None and attrs.get("data-code"):
            self.cell["article"] = attrs["data-code"]

    def handle_endtag(self, tag):
        articles = None
        if tag == "table" and self.table is not None:
            articles = {}
            occupied = set()
            for r, row in enumerate(self.table["rows"]):
                c = 0
                for cell in row:
                    while (r, c) in occupied:
                        c += 1
                    for dr in range(cell["rowspan"]):
                        for dc in range(cell["colspan"]):
                            occupied.add((r + dr, c + dc))
                            if cell.get("article"):
                                articles[(r + dr, c + dc)] = cell["article"]
                    c += cell["colspan"]
        super().handle_endtag(tag)
        if articles is not None:
            self.tables[-1]["articles"] = articles


def price_articles(record, html):
    parser = ArticleGrid()
    parser.feed(html)
    family = "EGA1-4" if "/ega-1-4-" in record["pageUrl"] else record["code"]
    source = {"sourceUrl": record["pageUrl"]}
    result = {}
    for table in parser.tables:
        grid = table["grid"]
        if not any(value in ("€", "euro", "Euro") for row in grid for value in row):
            continue
        heading = table["heading"]
        title = heading if "listino" in heading.lower() else "Listino Prezzi " + heading
        columns = max(map(len, grid))
        rows = [[record["name"]], [title]] + grid
        cells = {"sheets": [{"title": "Official HTML table", "maxRow": len(rows), "maxColumn": columns,
            "mergedRanges": [], "rows": [{"row": i + 1, "values": row + [None] * (columns - len(row))} for i, row in enumerate(rows)],
            "cells": [{"row": i + 1, "column": j + 1, "value": value} for i, row in enumerate(rows) for j, value in enumerate(row)]}]}
        prices, _ = normalizer.normalize_workbook(cells, source, family)
        for price in prices:
            code = table["articles"].get((price["sourceRow"] - 3, price["sourceColumn"] - 1))
            if code:
                result.setdefault(price["id"], set()).add(code)
    return result


def fetch_article(entry):
    code, url = entry
    target = CACHE / f"{code}.json"
    if target.exists():
        return code, json.loads(target.read_text(encoding="utf-8"))
    request = urllib.request.Request(url, urllib.parse.urlencode({"code": code, "tenant": "current"}).encode(),
        headers={"X-WINTER-REQUEST-HANDLER": "productCatalog::onLoadArticle", "X-Requested-With": "XMLHttpRequest", "Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=45) as response:
        raw = response.read()
    item = json.loads(raw)
    if item.get("code") != code or not isinstance(item.get("description"), str) or not item["description"].strip():
        raise ValueError(f"Invalid official article {code}")
    item = {"code": code, "description": item["description"], "sourceUrl": url,
        "retrievedAt": dt.datetime.now(dt.timezone.utc).isoformat(), "sha256": hashlib.sha256(raw).hexdigest()}
    target.write_text(json.dumps(item, ensure_ascii=False), encoding="utf-8")
    return code, item


def main():
    CACHE.mkdir(exist_ok=True)
    catalog = json.loads((ROOT / "catalog-data/generated/ecoclima-prices.json").read_text(encoding="utf-8"))
    wanted = {p["id"] for p in catalog["prices"]}
    records = json.loads((SOURCE / "complete-discovery.json").read_text(encoding="utf-8"))["records"]
    matches, urls = {}, {}
    for record in records:
        if "htmlSource" not in record:
            continue
        html = (SOURCE / record["htmlSource"]["filename"]).read_text(encoding="utf-8")
        for identity, codes in price_articles(record, html).items():
            if identity in wanted:
                matches.setdefault(identity, set()).update(codes)
                for code in codes:
                    urls[code] = record["pageUrl"]
    exact = {key: next(iter(codes)) for key, codes in matches.items() if len(codes) == 1}
    selected = {code: urls[code] for code in set(exact.values())}
    print(f"Mapped {len(exact)}/{len(wanted)} prices to {len(selected)} official articles", flush=True)
    articles, failures = {}, {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(fetch_article, entry): entry[0] for entry in sorted(selected.items())}
        for index, future in enumerate(concurrent.futures.as_completed(futures)):
            try:
                code, item = future.result()
                articles[code] = item
            except Exception as error:
                failures[futures[future]] = str(error)
            if index % 100 == 0:
                print(f"Articles {index + 1}/{len(selected)}", flush=True)
    output = {"articles": dict(sorted(articles.items())), "priceArticles": dict(sorted((key, code) for key, code in exact.items() if code in articles))}
    (ROOT / "catalog-data/generated/ecoclima-articles.json").write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (CACHE / "failures.json").write_text(json.dumps(failures, indent=2), encoding="utf-8")
    print(f"Saved {len(articles)} official article descriptions; {len(failures)} unavailable: {failures}", flush=True)


if __name__ == "__main__":
    main()
