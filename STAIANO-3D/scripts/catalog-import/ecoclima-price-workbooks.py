"""Conservatively normalize archived commercial cells; retain ambiguous cells as issues."""
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import re

SCRIPT_DIRECTORY = Path(__file__).resolve().parent
ROOT = SCRIPT_DIRECTORY if SCRIPT_DIRECTORY.name == "ecoclima-commercial-official" else Path(__file__).resolve().parents[2] / "catalog-data" / "sources" / "ecoclima-commercial-official"
DIMENSION_KEYS = ("lengthMm", "widthMm", "heightMm", "diameterMm", "slotCount", "slotWidthMm")


def text(value):
    raw = str(value or "")
    if "\u00c3" in raw or "\u00c2" in raw:
        try:
            raw = raw.encode("latin-1").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
    return raw.replace("\u00c2\u00a0", " ").replace("\u00a0", " ").strip()


def cents(value):
    cleaned = text(value).replace("€", "").strip()
    if not re.fullmatch(r"(?:\d+|\d{1,3}(?:\.\d{3})+),\d{2}", cleaned):
        return None
    return int(Decimal(cleaned.replace(".", "").replace(",", ".")) * 100)


def integer(value):
    if isinstance(value, (int, float)) and value > 0 and value == int(value):
        return int(value)
    cleaned = text(value)
    match = re.fullmatch(r"(\d+)(?:\s*mm)?", cleaned)
    return int(match[1]) if match and int(match[1]) > 0 else None


def rectangle(value):
    match = re.search(r"(?<!\d)(\d+)\s*[xX×]\s*(\d+)(?!\d)", text(value))
    return {"widthMm": int(match[1]), "heightMm": int(match[2])} if match else None


def model_label(value, family):
    label = text(value)
    descriptive = re.match(r"(?:Diffusore|Griglia|Bocchetta)\s+([A-Z][A-Z0-9-]+)", label)
    if descriptive:
        return descriptive[1], label
    if label.lower() in ("diffusore", "griglia", "bocchetta", "valvola"):
        return family, label
    match = re.match(r"([A-Z][A-Z0-9]*(?:[-/][A-Z0-9]+)*°?)(?=$|\s|[-])", label)
    return (match[1], label) if match else (None, label)


def kind(model, label):
    lowered = label.lower()
    if "continuit" in lowered:
        return "continuity-kit"
    if model.startswith("EPI") or "plenum isolato" in lowered:
        return "insulated-plenum"
    if model.startswith("EPZ"):
        return "accessory"
    if "ponte di fissaggio" in lowered:
        return "fixing-bridge"
    if model.startswith("K-") or "kit" in lowered and ("fissaggio" in lowered or "clips" in lowered):
        return "fixing-kit"
    if (model.startswith(("EPZ", "SC", "CT", "EDZ", "SD", "EQUA", "EARS", "EDDA", "EDDD", "EDLM"))
            or any(word in lowered for word in ("serranda", "deflettor", "staff", "collare", "angolo", "vite", "tappino", "clip", "controtelaio", "filtro", "servomotor", "plenum"))):
        return "accessory"
    return "terminal"


def normalize_workbook(cells, source, familyCode):
    prices, issues = [], []
    for sheet_index, sheet in enumerate(cells["sheets"]):
        rows = {entry["row"]: list(entry["values"]) for entry in sheet["rows"]}
        populated = {(entry["row"], entry["column"]): entry["value"] for entry in sheet["cells"]}
        def get(row, column):
            return rows.get(row, [None] * sheet["maxColumn"])[column - 1] if column <= sheet["maxColumn"] else None
        def header_get(row, column):
            value = get(row, column)
            if value is not None:
                return value
            for merged in sheet.get("mergedRanges", []):
                match = re.fullmatch(r"([A-Z]+)(\d+):([A-Z]+)(\d+)", merged)
                if not match:
                    continue
                def column_number(letters):
                    number = 0
                    for letter in letters:
                        number = number * 26 + ord(letter) - 64
                    return number
                left, top, right, bottom = column_number(match[1]), int(match[2]), column_number(match[3]), int(match[4])
                if top <= row <= bottom and left <= column <= right:
                    return get(top, left)
            return None
        def issue(row, column, reason, value=None):
            issues.append({"familyCode": familyCode, "sourceUrl": source["sourceUrl"], "sheet": sheet["title"],
                           "sourceRow": row, "sourceColumn": column, "value": value, "reason": reason})
        def emit(row, column, model, label, dimensions, color=None, connection=None, price_kind=None, size_code=None, original_dimensions=None):
            raw = get(row, column)
            amount = cents(raw)
            if amount is None:
                if text(raw) not in ("", "-", "a.r.", "a.r", "a richiesta"):
                    issue(row, column, "Malformed or unpublished price; not coerced", raw)
                return
            if not model:
                issue(row, column, "Published price has no unambiguous model", raw)
                return
            complete_dimensions = dict.fromkeys(DIMENSION_KEYS)
            complete_dimensions.update(dimensions)
            price_kind = price_kind or kind(model, label)
            family_description = text(get(1, 1)).lower()
            product_description = label.lower().split(" - ", 1)[-1]
            integrated_terminal = product_description.startswith(("diffusore", "griglia", "bocchetta", "ugello", "predisposto per servomotore"))
            standalone_accessory = any(word in label.lower() for word in ("raccordo", "collare", "coprighiera", "deflettore", "plenum", "servomotori", "kit", "staffa"))
            if price_kind == "accessory" and integrated_terminal and not standalone_accessory:
                price_kind = "terminal"
            if price_kind == "terminal" and any(word in family_description for word in ("plenum realizzato", "plenum in", "box di distribuzione", "curva a", "tubo telescopico", "prolunga telescopica", "serrande di regolazione", "regolatore di portata")):
                price_kind = "accessory"
            if price_kind == "terminal" and not any(complete_dimensions.values()) and size_code is None:
                if model != familyCode:
                    size_code = model
                else:
                    issue(row, column, "Terminal price lacks explicit dimensions or catalog model size", raw)
                    return
            identity_parts = [familyCode, price_kind, model, complete_dimensions, color, connection]
            if size_code is not None:
                identity_parts.append(size_code)
            identity = json.dumps(identity_parts, sort_keys=True)
            prices.append({"id": "ecoclima-" + hashlib.sha256(identity.encode()).hexdigest()[:24],
                "familyCode": familyCode, "kind": price_kind, "modelCode": model, "label": label,
                "dimensions": complete_dimensions, "colorCode": color, "connectionPosition": connection,
                "catalogSizeCode": size_code,
                "unitPriceCents": amount, "currency": "EUR", "sourceMetadata": source,
                "sourceTable": sheet_index, "sourceRow": row, "sourceColumn": column, "originalPrice": str(raw)})
            if original_dimensions:
                prices[-1]["originalDimensionsMm"] = original_dimensions

        title_rows = [r for r in rows if "listino" in text(get(r, 1)).lower()]
        currency_rows = [r for r in rows if any(text(v) in ("€", "Euro", "euro") for v in rows[r])]
        for currency_row in currency_rows:
            currency_columns = [c for c in range(1, sheet["maxColumn"] + 1) if text(get(currency_row, c)) in ("€", "Euro", "euro")]
            # A single 'Euro' spanning length columns is handled below only for the exact slot table.
            header_row = currency_row - 1
            if not rows.get(header_row):
                continue
            end = min([r for r in title_rows + currency_rows if r > currency_row] + [sheet["maxRow"] + 1])
            start = max([r for r in title_rows if r < currency_row] + [1])
            context = " ".join(text(get(r, 1)) for r in range(start, currency_row))
            title = text(get(start, 1))
            color_match = re.search(r"RAL\s*(\d{4})", context, re.I)
            if not color_match and "continua" in title.lower():
                prior_titles = " ".join(text(get(r, 1)) for r in title_rows if r <= start)
                prior_colors = list(re.finditer(r"RAL\s*(\d{4})", prior_titles, re.I))
                color_match = prior_colors[-1] if prior_colors else None
            title_color = re.search(r"RAL\s*(\d{4})", title, re.I)
            color = "RAL" + color_match[1] if color_match and (title_color or not re.search(r"\+\s*\d+\s*%", context)) else None
            if color_match and color is None:
                issue(start, 1, "Published finish surcharge excluded from base price; separate option required", context)
            connection = "lateral" if re.search(r"listino[^\n]*stacco laterale", title, re.I) else None
            headers = [get(header_row, c) for c in range(1, sheet["maxColumn"] + 1)]
            # Combined dimension/model lists carry their headers on the currency row itself.
            if any(word in text(get(currency_row, 1)).lower() for word in ("modello", "disegno", "descrizione", "diametro", "ø")):
                if not any(integer(v) for v in headers) and any(text(get(currency_row, c)) not in ("", "€", "Euro", "euro") for c in range(2, sheet["maxColumn"] + 1)):
                    headers = [get(currency_row, c) for c in range(1, sheet["maxColumn"] + 1)]
            # Rectangular H/L price matrices retain explicit row and column dimensions.
            if integer(get(header_row, 2)) and any(text(get(r, 1)).upper() == "H" and text(get(r, 2)).upper() == "L" for r in range(start, currency_row)):
                matrix_model = familyCode
                for r in range(start, header_row):
                    label = text(get(r, 1))
                    candidate, _ = model_label(label, familyCode)
                    title_model = re.search(r"Listino\s+Prezzi\s+([A-Z][A-Z0-9-]+)", label)
                    if title_model:
                        matrix_model = title_model[1]
                    elif candidate and label not in ("H", "L") and not label.lower().startswith(("listino", "vernici", "nota", "note", "dimension")):
                        matrix_model = candidate
                    elif label.lower().startswith("filtro "):
                        matrix_model = label
                for r in range(currency_row + 1, end):
                    height = integer(get(r, 1))
                    if height:
                        for c in currency_columns:
                            width = integer(get(header_row, c))
                            if width:
                                emit(r, c, matrix_model, matrix_model, {"widthMm": width, "heightMm": height}, color)
                continue

            # Linear tables with a length/model column and named profiles.
            if "lunghezza" in text(get(header_row, 2)).lower() or (text(get(header_row, 2)).lower() == "modello" and any("ferito" in text(get(r, 1)).lower() for r in range(currency_row + 1, end))):
                slot_count = None
                slot_match = re.search(r"(\d+)\s*feritoi", context, re.I)
                if slot_match:
                    slot_count = int(slot_match[1])
                width_match = re.search(r"(?:feritoi\w*\s+(?:da\s+)?)((?:20|30))\s*mm", context, re.I)
                slot_width = int(width_match[1]) if width_match else None
                for r in range(currency_row + 1, end):
                    slot_match = re.search(r"(\d+)\s*feritoi", text(get(r, 1)), re.I)
                    if slot_match:
                        slot_count = int(slot_match[1])
                    width_match = re.search(r"feritoi\w*\s+(?:da\s+)?(\d+)\s*mm", text(get(r, 1)), re.I)
                    if width_match:
                        slot_width = int(width_match[1])
                    length = integer(get(r, 2))
                    if not length or not slot_count:
                        continue
                    for c in currency_columns:
                        model, label = model_label(get(header_row, c), familyCode)
                        emit(r, c, model, label, {"lengthMm": length, "slotCount": slot_count, "slotWidthMm": slot_width}, color if model and not model.startswith(("EPI", "EPZ")) else None)
                continue

            if text(get(currency_row, 1)).lower().startswith("nr. feritoie"):
                for r in range(currency_row + 2, end):
                    slots = integer(get(r, 1))
                    if slots:
                        for c in range(2, sheet["maxColumn"] + 1):
                            length = integer(get(currency_row + 1, c))
                            if length:
                                emit(r, c, familyCode, familyCode, {"lengthMm": length, "slotCount": slots})
                continue

            accessory_caption = text(get(currency_row, 1)) or text(get(header_row, 1))
            if accessory_caption.lower() == "ponte di fissaggio" or "angolo" in accessory_caption.lower():
                for r in range(currency_row + 1, end):
                    slots_match = re.search(r"(\d+)\s*feritoi", text(get(r, 1)), re.I)
                    if not slots_match:
                        continue
                    for c in currency_columns:
                        if "ponte" in accessory_caption.lower():
                            emit(r, c, accessory_caption, accessory_caption + " - " + text(get(r, 1)),
                                 {"slotCount": int(slots_match[1])}, price_kind="fixing-bridge")
                        else:
                            accessory_model, accessory_label = model_label(get(header_row, c), familyCode)
                            emit(r, c, accessory_model, accessory_caption + " - " + accessory_label,
                                 {"slotCount": int(slots_match[1])}, price_kind="accessory")
                continue

            # Remaining price rows: named models, explicit rectangles, nominal circular sizes.
            circular = "circolar" in text(get(1, 1)).lower() or "valvole" in text(get(1, 1)).lower() or familyCode.startswith("EDSC")
            inherited_rectangle = None
            for r in range(currency_row + 1, end):
                first = text(get(r, 1))
                dimensions = rectangle(first)
                if dimensions:
                    inherited_rectangle = dimensions
                elif not first and inherited_rectangle and "canale" in " ".join(text(h) for h in headers).lower():
                    dimensions = inherited_rectangle.copy()
                numeric_model = integer(get(r, 1))
                for c in currency_columns:
                    if cents(get(r, c)) is None:
                        continue
                    header = text(headers[c - 1])
                    model, label = model_label(header, familyCode)
                    inline_model_column = next((dc for dc in range(c - 1, 0, -1) if
                        (model_label(get(currency_row, dc), familyCode)[0] or "").startswith(("E", "MCA", "SER", "K-", "CT", "SC", "SD", "CR"))), None)
                    if inline_model_column:
                        inline_label = text(get(currency_row, inline_model_column))
                        model, label = model_label(inline_label, familyCode)
                    # Multi-level headers retain their published model above voltage/control variants.
                    if not model or model in ("ON", "OFF", "ON/OFF"):
                        for hr in range(start + 1, currency_row):
                            candidate = text(header_get(hr, c))
                            candidate_model, _ = model_label(candidate, familyCode)
                            if candidate_model and candidate_model not in ("H", "L", "ON", "OFF", "ON/OFF"):
                                model, label = candidate_model, candidate
                                break
                    motor_labels = [text(header_get(hr, c)) for hr in range(start + 1, currency_row)]
                    if any("servomotor" in value.lower() for value in motor_labels):
                        model = " | ".join(dict.fromkeys(value for value in motor_labels if value))
                        label = model
                    local_dimensions = dict(dimensions or {})
                    local_connection = connection
                    local_color = color
                    size_code = None
                    block_label = " ".join((context, text(get(currency_row, 1))))
                    block_kind = "fixing-kit" if "kit" in block_label.lower() and ("clips" in block_label.lower() or "fissaggio" in block_label.lower()) else None
                    row_color = re.search(r"RAL\s*(\d{4})", first, re.I)
                    if row_color:
                        local_color = "RAL" + row_color[1]
                    # Two independent dimension/price tables may occupy the same worksheet rows.
                    dimension_columns = [dc for dc in range(1, c) if
                        re.search(r"(?:dimension|L\s*1?\s*x\s*H\s*1?)", text(get(currency_row, dc)) + " " + text(get(header_row, dc)), re.I)]
                    if dimension_columns:
                        local_rectangle = rectangle(get(r, dimension_columns[-1]))
                        if local_rectangle:
                            local_dimensions = local_rectangle
                            dimensions = local_rectangle
                    if inline_model_column:
                        inline_value = text(get(r, inline_model_column))
                        dimensions = rectangle(inline_value)
                        local_dimensions = dict(dimensions or {})
                        inline_diameter = re.search(r"[Øø]\s*(\d+)", inline_value)
                        if inline_diameter:
                            local_dimensions["diameterMm"] = int(inline_diameter[1])
                    description = " ".join(text(get(r, dc)) for dc in range(1, c)
                                            if dc != inline_model_column)
                    if re.search(r"manicotto|raccordo|collare|prolunga", description, re.I):
                        diameter = re.search(r"[Øø]\s*(\d+)\s*mm", description, re.I)
                        if diameter:
                            local_dimensions["diameterMm"] = int(diameter[1])
                    if dimensions:
                        if not model and model_label(first, familyCode)[0]:
                            model, label = model_label(first, familyCode) if rectangle(first) else (first, first)
                        if not model and model_label(first, familyCode)[0] and re.search(r"^[A-Z][A-Z0-9-]*\s+\d+\s*[xX]", first):
                            model, label = model_label(first, familyCode)
                        if "canale" in text(get(header_row, 2)).lower():
                            local_dimensions["diameterMm"] = integer(get(r, 2))
                        if not model and any("modello" in text(h).lower() for h in headers):
                            model, label = familyCode, familyCode
                        if not model and text(get(currency_row, 1)).lower() == "descrizione":
                            model, label = first, first
                    elif numeric_model and circular:
                        local_dimensions["diameterMm"] = numeric_model
                        size_code = (f"{first} · {text(get(r, 2))} m³/h"
                                     if familyCode == "ERDR" else first)
                        if not model and (text(headers[0]).lower() == "modello" or text(get(currency_row, 1)).lower() == "modello" or "ø" in text(get(currency_row, 1)).lower()):
                            model, label = familyCode, familyCode
                    elif numeric_model and model:
                        size_code = first
                    elif integer(get(header_row, c)) and model_label(first, familyCode)[0]:
                        model, label = first, first
                        size_code = text(get(header_row, c))
                        # Nominal sizes are retained as catalog model choices; axes require technical mapping.
                        local_dimensions = {}
                    elif re.fullmatch(r"\d+\s*/\s*\d+", header) and model_label(first, familyCode)[0]:
                        model, label = first, first
                        size_code = header
                        local_dimensions = {}
                    elif first and model_label(first, familyCode)[0] and (header.lower() in ("euro", "€", "") or not model):
                        if re.fullmatch(r"\d+\s*/\s*\d+", header):
                            issue(r, c, "Composite model size has no unambiguous dimension axes", get(r, c))
                            continue
                        model, label = model_label(first, familyCode) if " - " in first else (first, first)
                        # Dimension columns in named-model lists are adopted only when their header is explicit.
                        for dc, dh in enumerate(headers, 1):
                            if "dimension" in text(dh).lower():
                                found = rectangle(get(r, dc))
                                if found:
                                    local_dimensions.update(found)
                                    break
                    else:
                        explicit_model = next((dc for dc, dh in enumerate(headers, 1) if text(dh).lower() == "modello" and model_label(get(r, dc), familyCode)[0]), None)
                        if explicit_model:
                            model, label = text(get(r, explicit_model)), text(get(r, explicit_model))
                        elif any("diametro" in text(h).lower() or "Ø" in text(h) or "ø" in text(h) for h in headers):
                            if not model:
                                model, label = familyCode, familyCode
                        elif (text(headers[0]).lower() == "modello" or text(get(currency_row, 1)).lower() == "modello") and numeric_model:
                            model, label, size_code = familyCode, familyCode, first
                        elif text(headers[0]).lower() == "descrizione" and first:
                            model, label = first, first
                        else:
                            issue(r, c, "Price topology requires normalization review", get(r, c))
                            continue
                    # Explicit diameter/length headers are read without substituting nominal model numbers.
                    diameter_axes = []
                    for dc, dh in list(enumerate(headers, 1))[:c - 1]:
                        axis = text(dh).lower().replace(" ", "")
                        value = text(get(r, dc)).lstrip("Øø")
                        if (axis in ("diametro", "ø(mm)", "ød(mm)", "ød1", "ød1(mm)") or axis.startswith("diametro")) and integer(value):
                            diameter_axes.append((axis, integer(value)))
                        elif axis in ("l", "l(mm)") and integer(get(r, dc)):
                            local_dimensions["lengthMm"] = integer(get(r, dc))
                    if diameter_axes:
                        preferred = [value for axis, value in diameter_axes if axis not in ("ød1", "ød1(mm)")]
                        local_dimensions["diameterMm"] = preferred[-1] if preferred else diameter_axes[-1][1]
                    published_panel = rectangle(header)
                    if published_panel and "pannello" in header.lower():
                        local_dimensions.update(published_panel)
                    if not model and header.lower() in ("diffusore", "griglia"):
                        model = familyCode
                    # Rectangular plenums publish grouped upper/lateral headers one row above model labels.
                    group = text(get(header_row - 1, c))
                    if not group:
                        for gc in range(c - 1, 1, -1):
                            group = text(get(header_row - 1, gc))
                            if group:
                                break
                    if "stacco superiore" in group.lower():
                        local_connection = "upper"
                    elif "stacco laterale" in group.lower():
                        local_connection = "lateral"
                    if block_kind is None and "accessori" in block_label.lower() and model and kind(model, label or first) == "terminal":
                        block_kind = "accessory"
                    if inline_model_column:
                        model, label = model_label(get(currency_row, inline_model_column), familyCode)
                    original_dimensions = {}
                    for dc, dh in enumerate(headers, 1):
                        axis_label = text(dh)
                        if re.fullmatch(r"(?:[LHB]|[Øø]\s*D\d?)(?:\s*\(mm\))?", axis_label) and integer(get(r, dc)):
                            original_dimensions[axis_label] = integer(get(r, dc))
                    if familyCode in ("EAMV-V", "EMV-S", "EMV-J") and model and model != familyCode and original_dimensions:
                        # Mechanical component axes cannot stand in for catalog face dimensions.
                        local_dimensions = {}
                    emit(r, c, model, label or first, local_dimensions, local_color, local_connection, price_kind=block_kind, size_code=size_code, original_dimensions=original_dimensions)
        # Exact EDLS/EDLH accessory labels are published independently from profile price blocks.
        if familyCode in ("EDLS", "EDLH", "EDFL", "EDFLNA"):
            for r in rows:
                label = text(get(r, 1))
                if familyCode in ("EDLS", "EDLH") and "ponte di fissaggio per diffusori" in label.lower() and cents(get(r, 2)) is not None:
                    slots = re.search(r"(\d+)\s*feritoi", label, re.I)
                    width = 20 if "versione FA" in label else 30 if "versione FB" in label else None
                    emit(r, 2, label, label,
                         {"slotCount": int(slots[1]) if slots else None, "slotWidthMm": width}, price_kind="fixing-bridge")
                elif label.lower().startswith("kit di continuit") and cents(get(r, 2)) is not None:
                    for c in range(2, sheet["maxColumn"] + 1):
                        if cents(get(r, c)) is not None:
                            emit(r, c, label, label, {}, price_kind="continuity-kit")
    resolved_coordinates = {(price["sourceTable"], price["sourceRow"], price["sourceColumn"]) for price in prices}
    issues = [item for item in issues if not (item["reason"] == "Price topology requires normalization review" and
              (next((i for i, sheet in enumerate(cells["sheets"]) if sheet["title"] == item["sheet"]), -1), item["sourceRow"], item["sourceColumn"]) in resolved_coordinates)]
    return prices, issues


def main():
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    document_revision = manifest.get("catalogPriceListRevision")
    discovery = json.loads((ROOT.parent / "ecoclima" / "complete-discovery.json").read_text(encoding="utf-8-sig"))
    family_codes = {record["pageUrl"]: record["code"] for record in discovery["records"]}
    prices, issues, coverage, seen, conflicted = [], [], [], {}, set()
    for family in manifest["families"]:
        raw_source = family["sources"][0]
        family_code = family_codes.get(family["pageUrl"], family["code"])
        if family["slug"].startswith("ega-1-4-"):
            family_code = "EGA1-4"
        source = {"manufacturer": "Ecoclima", "sourceUrl": raw_source["url"], "sourceType": "excel",
                  "documentRevision": document_revision, "retrievedAt": raw_source["retrievedAt"],
                  "importedAt": raw_source["retrievedAt"], "sha256": raw_source["sha256"], "page": None}
        extracted = json.loads((ROOT / raw_source["filename"]).with_suffix(".cells.json").read_text(encoding="utf-8"))
        normalized, family_issues = normalize_workbook(extracted, source, family_code)
        issues.extend(family_issues)
        for price in normalized:
            if price["id"] in seen:
                if seen[price["id"]]["unitPriceCents"] != price["unitPriceCents"]:
                    conflicted.add(price["id"])
                    issues.append({"familyCode": family_code, "reason": "Conflicting published SKU prices", "price": price, "previousPrice": seen[price["id"]]})
                continue
            seen[price["id"]] = price
            prices.append(price)
        coverage.append({"familyCode": family_code, "sourceUrl": source["sourceUrl"],
                         "status": "no-published-price" if not any(cents(cell["value"]) is not None for sheet in extracted["sheets"] for cell in sheet["cells"]) else "normalization-review" if family_issues or not normalized else "published",
                         "note": f"{len(normalized)} unambiguous published cells normalized; {len(family_issues)} review issues. Original workbook retained."})
    html_records = json.loads((ROOT.parent / "ecoclima" / "complete-html-tables.json").read_text(encoding="utf-8-sig"))
    for record in html_records:
        family_code = "EGA1-4" if "/ega-1-4-" in record["pageUrl"] else record["code"]
        raw_source = record["htmlSource"]
        source = {"manufacturer": "Ecoclima", "sourceUrl": raw_source["sourceUrl"], "sourceType": "html",
                  "documentRevision": document_revision, "retrievedAt": raw_source["retrievedAt"],
                  "importedAt": raw_source["retrievedAt"], "sha256": raw_source["sha256"], "page": None}
        title_context = ""
        for table_index, table in enumerate(record["tables"]):
            grid = table["grid"]
            if not any(text(value) in ("€", "euro", "Euro") for row in grid for value in row):
                continue
            heading = text(table["heading"])
            if heading:
                title_context = heading
            heading = heading or title_context
            title = heading if "listino" in heading.lower() else "Listino Prezzi " + heading
            columns = max(len(row) for row in grid)
            pseudo_rows = [[text(record["name"])], [title]] + grid
            pseudo_cells = {"sheets": [{"title": "Official HTML table", "maxRow": len(pseudo_rows), "maxColumn": columns,
                 "mergedRanges": [], "rows": [{"row": i + 1, "values": row + [None] * (columns - len(row))} for i, row in enumerate(pseudo_rows)],
                 "cells": [{"row": i + 1, "column": j + 1, "value": value} for i, row in enumerate(pseudo_rows) for j, value in enumerate(row)]}]}
            normalized, html_issues = normalize_workbook(pseudo_cells, source, family_code)
            for issue_item in html_issues:
                issue_item["sourceTable"] = table_index
                issue_item["sourceRow"] = max(1, issue_item["sourceRow"] - 2)
            issues.extend(html_issues)
            for price in normalized:
                price["sourceTable"] = table_index
                price["sourceRow"] -= 2
                existing = seen.get(price["id"])
                if existing:
                    if existing["unitPriceCents"] != price["unitPriceCents"]:
                        issues.append({"familyCode": family_code, "reason": "HTML differs from preferred workbook SKU; retained workbook price", "price": price, "previousPrice": existing})
                    continue
                if price["colorCode"] is None:
                    equivalent_workbook = [candidate for candidate in prices if candidate["sourceMetadata"]["sourceType"] == "excel" and
                        all(candidate[key] == price[key] for key in ("familyCode", "kind", "modelCode", "dimensions", "connectionPosition", "catalogSizeCode", "unitPriceCents"))]
                    if len(equivalent_workbook) == 1:
                        continue
                seen[price["id"]] = price
                prices.append(price)
    prices = [price for price in prices if price["id"] not in conflicted]
    conflict_families = {seen[identity]["familyCode"] for identity in conflicted}
    for entry in coverage:
        family_prices = [price for price in prices if price["familyCode"] == entry["familyCode"]]
        family_issues = [item for item in issues if item["familyCode"] == entry["familyCode"]]
        if family_prices:
            workbook_count = sum(price["sourceMetadata"]["sourceType"] == "excel" for price in family_prices)
            html_count = len(family_prices) - workbook_count
            entry["status"] = "normalization-review" if family_issues or entry["familyCode"] in conflict_families else "published"
            entry["note"] = f"{len(family_prices)} unique published prices: {workbook_count} workbook; {html_count} official HTML fallback. {len(family_issues)} review issues. Original sources retained."
            if entry["familyCode"] in conflict_families:
                entry["note"] += " Conflicting published SKU prices excluded."
    result = {"prices": prices, "coverage": coverage, "issues": issues}
    (ROOT / "normalized-workbook-prices.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"prices": len(prices), "coverage": len(coverage), "issues": len(issues)}))


if __name__ == "__main__":
    main()
