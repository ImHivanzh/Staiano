"""Zehnder Easy/design radiators from the "Listino Tecnico 06/2026" datasheets.

Each fixed product is one row of a datasheet table: P H E L N, ΔT50, ΔT30, [Misto], V, M, Es, price.
A row is imported only when it passes every structural check, its price equals the Climanext
listino price of the same code, and (when the Climanext simulator publishes it) Q50/Q30 match.
Rows whose text layer is corrupted fail these checks and are skipped, never repaired by hand.
"""
import csv
import re

# listino description label -> (datasheet names, visual shape)
SERIES = {
    "kleo": (["zehnder-kleo"], "panel"),
    "orbis": (["zehnder-orbis"], "panel"),
    "ax": (["zehnder-ax"], "panel"),
    "jet-x": (["zehnder-jetx"], "panel"),
    "arteplano": (["zehnder-arteplano"], "panel"),
    "metropolitan": (["zehnder-metropolitan"], "towel"),
    "toga": (["zehnder-toga"], "towel"),
    "excelsior": (["zehnder-excelsior"], "towel"),
    "zeno": (["zehnder-zeno"], "towel"),
    "aura": (["zehnder-aura"], "towel"),
    "subway": (["zehnder-subway"], "towel"),
    "quaro": (["zehnder-quaro"], "towel"),
    "ribbon": (["zehnder-ribbon"], "towel"),
    "klaro spa": (["zehnder-klaro"], "towel"),
    "metropolitan spa": (["zehnder-metropolitanspa"], "towel"),
    "forma spa": (["zehnder-forma"], "towel"),
    "vitalo spa": (["zehnder-vitalospa"], "towel"),
    "vitalo bar": (["zehnder-vitalobar"], "towel"),
    "fina lean bar": (["zehnder-finalean"], "towel"),
    "archibald": (["zehnder-archibald"], "towel"),
    "folio belt": (["zehnder-foliobelt"], "towel"),
    "metropolitan bar": (["zehnder-metropolitan"], "towel"),
    "charleston turned": (["zehnder-turned"], "tubular"),
    "flow form": (["zehnder-flowform"], "tubular"),
    "tetris": (["zehnder-tetris"], "decorative"),
    "pera": (["zehnder-pera"], "decorative"),
    "alban": (["zehnder-alban"], "decorative"),
    "chime": (["zehnder-chime"], "decorative"),
    "sfera": (["zehnder-sfera"], "decorative"),
    "yucca": (["zehnder-yucca"], "decorative"),
    "yucca asym": (["zehnder-yuccaasym"], "decorative"),
    "folio hybrid": (["zehnder-foliohybrid"], "decorative"),
    "roda twist spa air": (["zehnder-rodatwist"], "decorative"),
}
LABELS = {"jet-x": "Jet-X", "ax": "AX"}
INT = re.compile(r"\d+")
DECIMAL = re.compile(r"\d+(?:,\d{1,2})?")


def read_csv(path):
    return list(csv.DictReader(open(path, encoding="utf-8-sig"), delimiter=";"))


def price(text):
    return text.replace(".", "")


def parse_row(tokens, listino_price, has_misto, simulator, size):
    """Return (P, N, Q50, Q30, V, M, Es) or None when any check fails."""
    if len(tokens) < 9 or price(tokens[-2]) != price(listino_price):
        return None
    es, mass, water = tokens[-3], tokens[-4], tokens[-5]
    tail = -7 if has_misto else -6
    if has_misto and not re.fullmatch(r"\d+|-", tokens[-6]):
        return None
    q30, q50, interaxis = tokens[tail], tokens[tail - 1], tokens[tail - 2].removesuffix("/50")
    if not (DECIMAL.fullmatch(water) and DECIMAL.fullmatch(mass) and re.fullmatch(r"\d,\d{1,2}", es)):
        return None
    if not all(INT.fullmatch(v) for v in (tokens[0], interaxis, q50, q30)):
        return None
    depth, interaxis, q50, q30 = int(tokens[0]), int(interaxis), int(q50), int(q30)
    values = [float(v.replace(",", ".")) for v in (water, mass, es)]
    if not (20 <= depth <= 200 and 0 < q30 < q50 <= 3000 and 1.1 <= values[2] <= 1.6 and interaxis > 0):
        return None
    if abs(q30 / q50 - 0.6 ** values[2]) > 0.035:  # a datasheet cell that contradicts its own exponent
        return None
    if not all(str(v) in tokens[1:tail - 2] for v in size):
        return None
    if simulator and simulator != (q50, q30):
        return None
    return depth, interaxis, q50, q30, *values


def import_series(products, base, pages, root):
    listino = {r["Codice"]: r for r in read_csv(root / "zehnder-climanext-listino.csv")}
    simulator = {}
    for r in read_csv(root / "zehnder-climanext-simulatore.csv"):
        m = re.search(r"([\d,.]+) W a 75/65.*?([\d,.]+) W a 55/45", r["Prestazione"])
        if m and r["Codice"].endswith("-9016"):
            simulator[r["Codice"]] = tuple(round(float(v.replace(",", "."))) for v in m.groups())
    rejected = []
    for code, row in listino.items():
        description = row["Prodotto"]
        match = re.match(r"(.+?) (\d+) \S (\d+) mm(?: \S (.*))?$", description)
        if not code.endswith("-9016") or not match or row["Famiglia"] != "Radiatori e scaldasalviette":
            continue
        key = match[1].lower()
        if key not in SERIES:
            continue
        names, shape = SERIES[key]
        label = LABELS.get(key, match[1])
        height, width = int(match[2]), int(match[3])
        variant = [p for p in re.split(r"\s[^\w\s]\s", match[4] or "") if p and not re.match(r"(bianco|classe)\b|\d+ elementi", p)]
        found = None
        for name in names:
            for number, text in enumerate(pages(name), 1):
                for line in text.splitlines():
                    words = line.split()
                    if code in words:
                        parsed = parse_row(words[words.index(code) + 1:], row["Prezzo di listino"], "Misto" in text, simulator.get(code), (height, width))
                        if parsed:
                            found = (name, number, text, parsed)
                            break
                if found:
                    break
            if found:
                break
        if not found:
            rejected.append(code)
            continue
        name, number, text, (depth, interaxis, q50, q30, water, mass, exponent) = found
        pressure = re.search(r"Pressione max di esercizio: (\d+(?:,\d)?) bar", "\n".join(pages(name)))
        temperature = re.search(r"Temperatura max di esercizio: (\d+) °C", "\n".join(pages(name)))
        family = " ".join([label, *variant])
        connection = code.split("-")[-2] if code.count("-") >= 2 else None
        item = base(name, family, number)
        item.update(id="zehnder-" + re.sub(r"[^a-z0-9]+", "-", code.lower()).strip("-"),
                    model=f"{label} {height}×{width}" + (" " + " ".join(variant) if variant else ""),
                    code=code, visualShape=shape, heightMm=height, pitchMm=width, interaxisMm=interaxis, depthMm=depth,
                    elementOutputW=q50, elementOutput30W=q30, exponentN=exponent, waterContentL=water, weightKg=mass,
                    maxPressureBar=float(pressure[1].replace(",", ".")) if pressure else None,
                    maxTemperatureC=float(temperature[1]) if temperature else None,
                    connections=f"Allacciamento {connection}" if connection else None,
                    widthNote=f"Prodotto completo a dimensioni fisse bianco 9016. Quote, rese, acqua e peso dell'intero radiatore da p.{number} del listino tecnico 06/2026; altre finiture con maggiorazione. Interasse orizzontale; valvole escluse.")
        products.append(item)
    return rejected
