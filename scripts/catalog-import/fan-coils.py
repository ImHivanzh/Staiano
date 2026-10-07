"""Normalize acquired official fan-coil sources; retain exact conditions and unknown data.

Sources are in catalog-data/sources/fan-coils/manifest.json. Network acquisition
is explicit (--acquire-images); normal generation is deterministic and offline.
"""
from pathlib import Path
from html.parser import HTMLParser
from datetime import datetime, timezone
import hashlib
import json
import re
import sys
import urllib.request
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "catalog-data/sources/fan-coils"
ASSETS = ROOT / "public/catalog-assets/fan-coils"
ASSETS.mkdir(parents=True, exist_ok=True)
MANIFEST = json.loads((SOURCE / "manifest.json").read_text(encoding="utf8"))
NOW = datetime.now(timezone.utc).isoformat()


def metadata(name, manufacturer, page=None):
    m = next(v for v in MANIFEST if v["name"] == name)
    path = SOURCE / (name + (".pdf" if m["sourceType"] == "pdf" else ".html"))
    if hashlib.sha256(path.read_bytes()).hexdigest() != m["sha256"]:
        raise ValueError(f"Source changed: review {name}")
    return {"manufacturer": manufacturer, **{k: m[k] for k in ("sourceUrl", "sourceType", "sha256", "retrievedAt")},
            "documentRevision": "AirLeaf comandi RS Rev.10" if name == "innova-m7" else
            "Catalogo gennaio 2026" if name == "olimpia-bi2" else
            "FCZ_I_UN50_16 / dati Eurovent 2025" if name == "aermec-fcz" else "Pagina prodotto acquisita 07/10/2026",
            "importedAt": m["retrievedAt"], "page": page}


def embedded_photo(name, source_name, page, image_name, caption):
    image = next(i for i in PdfReader(SOURCE / f"{source_name}.pdf").pages[page - 1].images if i.name == image_name)
    path = ASSETS / f"{name}.png"
    image.image.save(path)
    m = next(v for v in MANIFEST if v["name"] == source_name)
    return {"localPath": f"/catalog-assets/fan-coils/{path.name}", "sourceUrl": m["sourceUrl"],
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "caption": caption}


def acquired_photo(name, url, caption):
    path = ASSETS / f"{name}.jpg"
    if "--acquire-images" in sys.argv:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=30) as response:
            data = response.read(8 * 1024 * 1024 + 1)
        if len(data) > 8 * 1024 * 1024 or not data.startswith(b"\xff\xd8\xff"):
            raise ValueError("Invalid product image")
        path.write_bytes(data)
    if not path.exists():
        raise ValueError(f"Acquire official image first: {url}")
    return {"localPath": f"/catalog-assets/fan-coils/{path.name}", "sourceUrl": url,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "caption": caption}


class ProductText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        if data.strip():
            self.parts.append(data.strip())


def innova_products(name, prefix, photo):
    parser = ProductText()
    parser.feed((SOURCE / f"{name}.html").read_text(encoding="utf8"))
    text = re.sub(r"\s+", " ", " ".join(parser.parts))
    matches = list(re.finditer(rf"\b({prefix} (?:200|400|600|800|1000)(?: C)?(?: 4 tubi)?)\b(?= Resa totale)", text))
    if not matches:
        raise ValueError(f"No model blocks: {name}")
    for i, match in enumerate(matches):
        block = text[match.end():matches[i + 1].start() if i + 1 < len(matches) else len(text)]
        powers = re.findall(r"([0-9]+,[0-9]+)\s*kW", block)[:2]
        dims = re.findall(r"([0-9]+)\s*mm", block)[:3]
        if len(powers) != 2 or len(dims) != 3:
            raise ValueError(f"Incomplete original block: {match[1]}")
        pipes = "4" if "4 tubi" in match[1] else "2"
        heating_conditions = "Acqua 65/55 °C; aria ambiente 20 °C" if pipes == "4" else "Acqua 45/40 °C; aria ambiente 20 °C"
        if pipes == "4" and "W 65/55" not in block:
            raise ValueError("Heating condition not declared")
        yield {"id": f"innova-airleaf-{match[1].lower().replace(' ', '-')}-{pipes}t", "manufacturer": "Innova",
               "family": f"AirLeaf {prefix}", "model": match[1], "pipes": pipes,
               "widthMm": int(dims[0]), "heightMm": int(dims[1]), "depthMm": int(dims[2]),
               "mountings": ["wall"] if prefix == "SLS" else ["wall", "ceiling"],
               "dimensionNote": "Dimensioni unità dichiarate dal produttore; accessori di posa da verificare.",
               "features": ["Motore DC inverter", "Modulazione continua della ventilazione",
                            "Installazione ad incasso" if prefix == "SLI" else "Profilo ribassato 379 mm" if prefix == "SLS" else "Mobile metallico a vista"],
               "productPhoto": photo, "operatingPoints": [{"label": "Punto nominale pubblicato",
                   "coolingW": float(powers[0].replace(',', '.')) * 1000, "heatingW": float(powers[1].replace(',', '.')) * 1000,
                   "airflowM3h": None, "noiseDbA": None,
                   "coolingConditions": "Acqua 7/12 °C; aria ambiente 27 °C", "heatingConditions": heating_conditions,
                   "noiseConditions": "Rumore non pubblicato in questa fonte; non dedotto dalla potenza."}],
               "sourceMetadata": metadata(name, "Innova")}


photos = {
    "SL": acquired_photo("innova-sl", "https://www.innova.it/site/assets/files/1362/panoramica_-_sl.640x0.jpg", "Innova AirLeaf SL, immagine ufficiale della famiglia"),
    "SLS": acquired_photo("innova-sls", "https://www.innova.it/site/assets/files/1372/panoramica_sls.640x0.jpg", "Innova AirLeaf SLS, immagine ufficiale della famiglia"),
    "SLI": acquired_photo("innova-sli", "https://www.innova.it/site/assets/files/1374/panoramica_sli.640x0.jpg", "Innova AirLeaf SLI, immagine ufficiale della famiglia"),
}
products = []
for prefix, name in [("SL", "innova-sl-page"), ("SLS", "innova-sls-page"), ("SLI", "innova-sli-page")]:
    products.extend(innova_products(name, prefix, photos[prefix]))

# Published tables have three distinct speeds, not one maximum reused for noise.
olimpia_pages = json.loads((SOURCE / "olimpia-bi2.pages.json").read_text(encoding="utf8"))
olimpia_photo = embedded_photo("olimpia-bi2-air", "olimpia-bi2", 12, "Im0.jpg", "Olimpia Splendid Bi2 Air, immagine ufficiale della famiglia")
for family, page_number, width_start, codes in [("Bi2 Air", 12, 695, ["01851", "01852", "01853", "01854"]),
                                              ("Bi2 Smart S1", 20, 759, ["02122", "02123", "02124", "02125"])]:
    text = olimpia_pages[page_number - 1]
    def original_row(label):
        line = next(l for l in text.splitlines() if l.startswith(label))
        values = re.findall(r"(?<!\w)\d+(?:[.,]\d+)?", line.split("kW", 1)[-1] if "kW" in line else line.split("dB(A)", 1)[-1] if "dB(A)" in line else line.split("m3/h", 1)[-1] if "m3/h" in line else line.split("m³/h", 1)[-1])
        result = [float(v.replace(',', '.')) for v in values]
        if len(result) != 12:
            raise ValueError(f"Ambiguous original row {family}: {label}, {result}")
        return result
    cooling = original_row("Potenza resa totale in raffreddamento")
    heating = original_row("Potenza resa totale in riscaldamento a20/15 - w45/40")
    noise = original_row("Pressione sonora")
    flow = original_row("Portata d’aria")
    for i, size in enumerate([200, 400, 600, 800]):
        products.append({"id": f"olimpia-{codes[i]}", "manufacturer": "Olimpia Splendid", "family": family,
                         "model": f"SL AIR {size} DC TR" if family == "Bi2 Air" else f"SL SMART S1 {size} B DC", "pipes": "2",
                         "widthMm": width_start + i * 200, "heightMm": 599 if family == "Bi2 Air" else 579,
                         "depthMm": 150, "mountings": ["wall", "ceiling"],
                         "dimensionNote": "La scheda riporta profondità 129/150 mm: rappresentato ingombro cautelativo di 150 mm. Verificare allestimento prima della posa.",
                         "features": ["Motore DC brushless", "Controllo touch a bordo", "Telecomando di serie", "Multiset Control" if family == "Bi2 Air" else "Design total flat"],
                         "productPhoto": olimpia_photo if family == "Bi2 Air" else embedded_photo("olimpia-bi2-smart", "olimpia-bi2", 18, "Im0.png", "Olimpia Splendid Bi2 Smart, immagine ufficiale della famiglia"),
                         "operatingPoints": [{"label": label, "coolingW": cooling[i*3+j]*1000, "heatingW": heating[i*3+j]*1000,
                             "airflowM3h": flow[i*3+j], "noiseDbA": noise[i*3+j],
                             "coolingConditions": "Acqua 7/12 °C; aria 27 °C b.s. / 19 °C b.u.",
                             "heatingConditions": "Acqua 45/40 °C; aria 20 °C b.s. / 15 °C b.u.",
                             "noiseConditions": "Pressione sonora: ambiente 100 m³, riverbero 0,5 s, 1/4 sfera, distanza 3 m."} for j,label in enumerate(["Bassa", "Media", "Alta"])],
                         "sourceMetadata": metadata("olimpia-bi2", "Olimpia Splendid", page_number)})

aermec = json.loads((SOURCE / "aermec-fcz.pages.json").read_text(encoding="utf8"))[13]
aermec_photo = embedded_photo("aermec-fcz", "aermec-fcz", 1, "Im0.jp2", "Aermec FCZ, versioni a vista nella scheda ufficiale")
for block, sizes in [(aermec.split("FCZ600")[0], [100,150,200,250,300,350,400,450,500,550]),
                     ("FCZ600" + aermec.split("FCZ600",1)[1], [600,650,700,750,800,850,900,950,1000])]:
    def values(label, occurrence=0):
        line = [l for l in block.splitlines() if l.startswith(label)][occurrence]
        unit = "dB(A)" if "sonora" in label else "m³/h" if "Portata aria" in label else "kW"
        result = [float(v.replace(',', '.')) for v in line.split(unit)[-1].split()]
        if len(result) != len(sizes)*3: raise ValueError(f"Incomplete Aermec row: {label}")
        return result
    cooling = values("Potenza frigorifera kW")
    heating = values("Potenza termica kW",1)
    flow = values("Portata aria m³/h")
    noise = values("Livello di pressione sonora")
    for i,size in enumerate(sizes):
        width = 640 if size <=150 else 750 if size <=250 else 980 if size <=350 else 1200 if size <=550 else 1320
        products.append({"id": f"aermec-fcz{size}", "manufacturer": "Aermec", "family": "FCZ", "model": f"FCZ{size}",
                         "pipes": "2", "widthMm": width, "heightMm": 591 if size >=900 else 486, "depthMm": 220,
                         "mountings": ["wall", "ceiling"], "dimensionNote": "Ingombro versione a vista; allestimento, piedini e accessori da specificare.",
                         "features": ["Ventilatore centrifugo", "Tre velocità distinte", "Compatibile con sistema VMF (accessorio)", "Controllo T-touch opzionale"],
                         "productPhoto": aermec_photo, "operatingPoints": [{"label": label, "coolingW": cooling[i*3+j]*1000,
                             "heatingW": heating[i*3+j]*1000, "airflowM3h": flow[i*3+j], "noiseDbA": noise[i*3+j],
                             "coolingConditions": "Acqua 7/12 °C; aria 27 °C b.s. / 19 °C b.u.", "heatingConditions": "Acqua 45/40 °C; aria 20 °C b.s.",
                             "noiseConditions": "Pressione sonora pubblicata; metodo UNI EN 16583:15, condizioni della scheda."} for j,label in enumerate(["Bassa", "Media", "Alta"])],
                         "sourceMetadata": metadata("aermec-fcz", "Aermec",14)})

controls = []
m7_photo_path = ASSETS / "innova-m7-interface.png"
m7_source = metadata("innova-m7", "Innova", 13)
m7_photo = {"localPath": "/catalog-assets/fan-coils/innova-m7-interface.png", "sourceUrl": m7_source["sourceUrl"],
            "sha256": hashlib.sha256(m7_photo_path.read_bytes()).hexdigest(),
            "caption": "Interfaccia M7, disegno originale EEB749 nel manuale Innova"} if m7_photo_path.exists() else None
for code, connection, boards, extra in [("EEB749II", "wired", ["ESE745II", "ESE748II"], []),
                                       ("EFB749II", "wifi-wired", ["ESE745II", "ESE748II"], ["Wi-Fi integrato e nuova App"]),
                                       ("EGB749II", "bluetooth", ["ESE746II", "ESE741II"], ["Collegamento Bluetooth"])]:
    controls.append({"id": f"innova-{code.lower()}", "manufacturer": "Innova", "series": "M7", "model": code,
                     "widthMm": 117, "heightMm": 80, "depthMm": 5, "connection": connection,
                     "features": ["Interfaccia tattile LED", "Termostato e sonda temperatura/umidità", "Colore bianco", *extra],
                     "compatibleFamilies": ["AirLeaf SLI", "AirLeaf RSI", "AirLeaf SLSI"], "requiredBoards": boards,
                     "productPhoto": m7_photo, "sourceMetadata": metadata("innova-m7", "Innova",6)})

data = {"products": products, "controls": controls}
version = "fan-coils-" + hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]
dest = ROOT / "catalog-data/generated/fan-coils.json"
history = dest.with_name("fan-coils-history.json")
old = json.loads(dest.read_text(encoding="utf8")) if dest.exists() else None
versions = json.loads(history.read_text(encoding="utf8")) if history.exists() else {}
if old and old["version"] != version: versions[old["version"]] = old
history.write_text(json.dumps(versions, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
dest.write_text(json.dumps({"version": version, **data}, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
print(json.dumps({"version": version, "products": len(products), "controls": len(controls)}))
