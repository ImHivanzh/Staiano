"""Normalize official Ecoclima grille and outlet tables without estimated flows.

Consumes archived primary HTML and its span-expanded grids. Accessories never
contribute terminal dimensions. Published numeric anomalies remain review rows.
"""
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "catalog-data/sources/ecoclima"
EXCLUDED = {"EDLS", "EBLF", "EGQ", "ETA", "EVVMC", "EGS", "EADD"}


def number(value):
    value = str(value).strip().replace(" ", "").replace(",", ".")
    if not re.fullmatch(r"\d+(?:\.\d+)?", value):
        return None
    return float(value)


def dimensions(value):
    match = re.fullmatch(r"\s*(\d+)\s*[x×]\s*(\d+)\s*", value, re.I)
    return tuple(map(int, match.groups())) if match else None


def point(flow, velocity, pressure=None, noise="", throw=None, use=None, setting=None):
    noise = re.sub(r"\s+", "", noise)
    pressure_text = str(pressure or "")
    notes = []
    exact_noise = number(noise)
    upper_noise = None
    if noise.startswith("<"):
        upper_noise = number(noise[1:])
    elif re.fullmatch(r"\d+(?:[.,]\d+)?/\d+(?:[.,]\d+)?", noise):
        upper_noise = max(number(part) for part in noise.split("/"))
        notes.append("Rumore pubblicato come intervallo; limite superiore conservativo.")
    if "/" in pressure_text:
        notes.append(f"Perdita di carico pubblicata come intervallo {pressure_text} Pa; nessun valore puntuale assegnato.")
    result = dict(airflowM3h=flow, airflowPerMeterM3h=None, velocityMs=velocity,
                  pressureDropPa=number(pressure_text), throwM=throw,
                  noiseDbA=exact_noise, noiseUpperBoundDbA=upper_noise,
                  noiseLabel=noise or "Non pubblicato", referenceLengthM=None,
                  quality="valid", qualityNote=" ".join(notes) or None)
    if use:
        result["use"] = use
    if setting:
        result["settingCode"] = setting
    return result


def matrix_headers(grid):
    """Find an actual width-header row, including leading drawing columns."""
    for row_index, row in enumerate(grid[:5]):
        cols = [(c, int(number(cell))) for c, cell in enumerate(row)
                if number(cell) is not None and number(cell) >= 50]
        if len(cols) >= 2 and all(number(cell) is None for cell in row[:cols[0][0]]):
            return row_index, cols
    return None


def velocity_settings(tables):
    """Velocity-linked noise and pressure; preserve deflection configurations."""
    settings = {}
    for table in tables:
        heading = table["heading"].lower()
        if not ("rumorosit" in heading or "carico" in heading):
            continue
        grid = table["grid"]
        for row_index, row in enumerate(grid):
            velocity = number(row[0]) if row else None
            if velocity is None or velocity > 20:
                continue
            for col in range(1, len(row)):
                headers = " ".join(grid[r][col] for r in range(row_index)
                                   if col < len(grid[r]))
                angle = re.search(r"Deflessione\s*(\d+)", headers, re.I)
                setting = "deflessione-" + angle[1] if angle else "standard"
                entry = settings.setdefault((velocity, setting), {})
                if "dB" in headers or ("rumorosit" in heading and "carico" not in heading):
                    entry["noise"] = row[col]
                elif "Pa" in headers or "carico" in heading:
                    entry["pressure"] = row[col]
    return settings


def create_variant(code, dims):
    width, height = dims
    return dict(id=f"ecoclima-{code.lower()}-{width}x{height}", widthMm=width,
                heightMm=height, depthMm=None, lengthMm=None, slotWidthMm=None,
                slotCount=None, commercialLengthsMm=[], effectiveAreaM2=None,
                operatingPoints=[], faceWidthMm=None, faceHeightMm=None,
                bodyDepthMm=None, dimensionNote="Dimensioni L×H nominali pubblicate; ingombri e profondità non ricavati dalle immagini.")


def normalize(record):
    code = record["code"]
    if code == "EGA" and "ega-1-4-" in record["pageUrl"]:
        code = "EGA1-4"
    tables = record["tables"]
    settings = velocity_settings(tables)
    variants = {}
    provenance = {}
    model_codes = set()
    warnings = []
    supporting_sources = []

    def variant(dims, evidence):
        if dims not in variants:
            variants[dims] = create_variant(code, dims)
        provenance.setdefault(dims, set()).add(evidence)
        return variants[dims]

    def append(v, flow, velocity, pressure=None, noise="", throw=None, use=None, setting=None):
        if not flow or flow <= 0:
            return
        if pressure is None and not noise:
            alternatives = [(name, value) for (vel, name), value in settings.items() if vel == velocity]
            # Deflection-specific pressure/noise are valid only for their labelled configuration.
            for name, value in alternatives or [("standard", {})]:
                v["operatingPoints"].append(point(flow, velocity, value.get("pressure"),
                                                  value.get("noise", ""), throw if name in ["standard", "deflessione-0"] else None, use, name))
        else:
            v["operatingPoints"].append(point(flow, velocity, pressure, noise, throw, use, setting))

    for table_index, table in enumerate(tables):
        heading, grid = table["heading"], table["grid"]
        evidence = f"HTML tabella {table_index + 1}: {heading or 'continuazione'}"
        if not grid:
            continue
        flat_header = " ".join(cell for row in grid[:3] for cell in row)
        headers = matrix_headers(grid)

        # Sezione efficace matrices are physical published values, never flow generators.
        if "sezione efficace" in heading.lower() and headers:
            header_row, widths = headers
            height_col = widths[0][0] - 1
            for row in grid[header_row + 1:]:
                height = number(row[height_col])
                if height is None or height < 50:
                    continue
                for col, width in widths:
                    area = number(row[col])
                    if area is not None and 0 < area < width * height / 1e6:
                        variant((width, int(height)), evidence)["effectiveAreaM2"] = area
                    elif area is not None:
                        warnings.append(dict(table=table_index + 1, dimension=f"{width}x{int(height)}", field="effectiveAreaM2", printed=row[col], reason="Sezione efficace non plausibile; valore non assegnato."))

        # Product price rows establish actual offered dimensions; accessories do not.
        primary_price = "listino" in heading.lower() and not any(
            term in heading.lower() for term in ["filtro spessore", "plenum", "serranda", "accessori"])
        model_header = any(re.match(r"^" + re.escape(record["code"]) + r"(?:$|[- /\d])", cell)
                           for row in grid[:2] for cell in row)
        if primary_price or (not heading and model_header and not any(
                term in flat_header for term in ["Plenum", "Stacco", "L1 x H1", "L1xH1"])):
            for row in grid[:2]:
                for cell in row:
                    if re.match(r"^" + re.escape(record["code"]) + r"(?:$|[- /\d])", cell) and len(cell) < 30:
                        model_codes.add(cell.replace("�", "°"))
            for row in grid:
                for col, cell in enumerate(row):
                    dims = dimensions(cell)
                    face_col = next((c for c, label in enumerate(grid[0]) if "Dimensioni Esterno Cornice" in label), None)
                    nominal_col = next((c for c, label in enumerate(grid[0]) if "Dimensioni L x H" in label), None)
                    if face_col is not None and nominal_col is not None and col == face_col:
                        # Nominal opening and external face describe the same item, not two SKUs.
                        continue
                    if dims and any(value.strip() not in ["", "-", "–"] for value in row[col + 1:]):
                        v = variant(dims, evidence)
                        available = [grid[0][c].replace("�", "°") for c in range(col + 1, len(row))
                                     if c < len(grid[0]) and grid[0][c].startswith(record["code"])
                                     and row[c].strip() not in ["", "-", "–"]]
                        if available:
                            v["modelCodes"] = sorted(set(v.get("modelCodes", []) + available))
                        if code == "EBCV" and col + 1 < len(row) and number(row[col + 1]):
                            v["connectionDiametersMm"] = sorted(set(v.get("connectionDiametersMm", []) + [int(number(row[col + 1]))]))
                        if "Esterno Cornice" in flat_header:
                            face = dimensions(row[face_col]) if face_col is not None else dims
                            v["faceWidthMm"], v["faceHeightMm"] = face
                            if nominal_col is not None:
                                v["originalDimensionsMm"] = dict(L=dims[0], H=dims[1], faceWidth=face[0], faceHeight=face[1])
                                v["dimensionNote"] = "Dimensioni L×H nominali pubblicate, con esterno cornice distinto. Profondità non assegnata."
                            else:
                                v["dimensionNote"] = "Dimensioni esterno cornice pubblicate. Foro di installazione e profondità non assegnati."
            if headers:
                header_row, widths = headers
                height_col = widths[0][0] - 1
                for row in grid[header_row + 1:]:
                    height = number(row[height_col])
                    if height is not None and height >= 50:
                        for col, width in widths:
                            if row[col].strip() not in ["", "-", "–"]:
                                variant((width, int(height)), evidence)

        functional = "funzionamento" in heading.lower()
        transposed = len(grid) > 2 and grid[0][0] == "Dimensioni LxH" and "Portata Aria" in grid[0]
        if transposed and code in ["EBP", "EBP-T"]:
            flows = {col: number(cell) for col, cell in enumerate(grid[1]) if col >= 3 and number(cell)}
            blocks = {}
            for row in grid[2:]:
                dims = dimensions(row[0])
                if dims:
                    if code == "EBP-T" and dims == (12000, 600):
                        warnings.append(dict(table=table_index + 1, dimension="12000x600", field="dimensions", printed=row[0], reason="Riga tecnica pubblicata 12000x600, listino 1200x600. Associazione ambigua: dati non trasferiti alla variante 1200x600."))
                        continue
                    blocks.setdefault(dims, {})[row[2]] = row
                    area = number(row[1])
                    if area:
                        variant(dims, evidence)["effectiveAreaM2"] = area
            for dims, rows in blocks.items():
                v = variant(dims, evidence)
                noise_row = next((r for label, r in rows.items() if label.startswith("dB")), None)
                velocity_row = next((r for label, r in rows.items() if "m/s" in label), None)
                for col, flow in flows.items():
                    noise = noise_row[col] if noise_row else ""
                    velocity = number(velocity_row[col]) if velocity_row else None
                    if not noise and velocity is None:
                        continue
                    append(v, flow, velocity, rows.get("Pa", [""] * len(grid[1]))[col], noise,
                           number(rows.get("L (m)", [""] * len(grid[1]))[col]), "supply", "mandata")
            continue
        if not functional:
            continue

        # H × L flow matrices, including rowspan expansion and trailing Pa/dB columns.
        if headers and "Portata" in flat_header:
            header_row, widths = headers
            height_col = widths[0][0] - 2
            if height_col >= 0:
                for row in grid[header_row + 1:]:
                    height, velocity = number(row[height_col]), number(row[height_col + 1])
                    if height is None or velocity is None or height < 50 or velocity > 20:
                        continue
                    pressure = row[widths[-1][0] + 1] if len(row) > widths[-1][0] + 1 else None
                    noise = row[widths[-1][0] + 2] if len(row) > widths[-1][0] + 2 else ""
                    for col, width in widths:
                        append(variant((width, int(height)), evidence), number(row[col]), velocity,
                               pressure, noise, use="return")
                continue

        # Individual ceiling-panel records publish dimensions, area, velocity and Q.
        if "Dimensioni Esterno Cornice" in flat_header:
            for row in grid[2:]:
                dim_col = next((c for c, cell in enumerate(row) if dimensions(cell)), None)
                if dim_col is None:
                    continue
                v = variant(dimensions(row[dim_col]), evidence)
                area_count = 2 if "Sezione Efficace del Filtro" in flat_header and "Sezione Efficace" in grid[0] else 1
                v["effectiveAreaM2"] = number(row[dim_col + 1])
                v["faceWidthMm"], v["faceHeightMm"] = v["widthMm"], v["heightMm"]
                v["dimensionNote"] = "Dimensioni esterno cornice pubblicate; sezione efficace riferita alla griglia o al filtro come indicato nella scheda."
                append(v, number(row[dim_col + area_count + 2]), number(row[dim_col + area_count + 1]), use="return")
            continue

        # L×H rows with published Q / throw column pairs; duplicated side-by-side groups.
        for row in grid[2:]:
            for dim_col, cell in enumerate(row):
                dims = dimensions(cell)
                if dims is None:
                    continue
                v = variant(dims, evidence)
                area_col = dim_col + (2 if code == "EBCV" else 1)
                if code == "EBCV":
                    channel_diameters = [int(n) for n in re.findall(r"\d+", row[dim_col + 1])]
                    v["connectionDiametersMm"] = sorted(set(v.get("connectionDiametersMm", []) + channel_diameters))
                v["effectiveAreaM2"] = number(row[area_col])
                next_dim = next((c for c in range(area_col + 1, len(row)) if dimensions(row[c])), len(row))
                for col in range(area_col + 1, next_dim):
                    labels = [g[col] for g in grid[:2] if col < len(g)]
                    if not any("/h" in label for label in labels):
                        continue
                    velocity = None
                    for label in labels:
                        m = re.search(r"Vk\s*([\d.,]+)\s*m/s", label)
                        if m:
                            velocity = number(m[1])
                    if velocity is None:
                        footer = next((g for g in reversed(grid) if "m/s" in " ".join(g[:area_col + 1])), None)
                        velocity = number(footer[col]) if footer else None
                    pressure_row = next((g for g in grid if g[0] == "Pa"), None)
                    noise_row = next((g for g in grid if g[0].startswith("dB")), None)
                    throw = number(row[col + 1]) if col + 1 < next_dim and "L1" in grid[1][col + 1] else None
                    use = "return" if code == "EBLS" and velocity == 1.5 else "supply"
                    setting = "ripresa-filtro-pulito-EFEBLS" if use == "return" else None
                    append(v, number(row[col]), velocity,
                           pressure_row[col] if pressure_row else None,
                           noise_row[col] if noise_row else "", throw, use, setting)

    # The EGQR model description explicitly offers a 595-mm external ceiling face;
    # it has no unambiguous performance row, so keep it available only manually.
    if code == "EGQR":
        v = variant((595, 595), "HTML descrizione modelli: versione da controsoffitto 595×595 mm esterno cornice")
        v["faceWidthMm"] = v["faceHeightMm"] = 595
        v["dimensionNote"] = "Dimensioni esterno cornice 595×595 mm dichiarate per versione da controsoffitto; dimensioni nominali interne e dati di funzionamento non assegnati."

    # The EGA PDF publishes a 700-mm column omitted from its HTML, with explicit Q rows.
    source = record["htmlSource"]
    extra_documents = []
    if code == "EGA":
        document = record["documents"][0]
        if hashlib.sha256((SOURCE / document["filename"]).read_bytes()).hexdigest() != document["sha256"]:
            raise ValueError("EGA archived PDF revision mismatch")
        text = (SOURCE / document["filename"]).with_suffix(".txt").read_text(encoding="utf8")
        widths = [200, 300, 400, 500, 600, 700, 800, 1000, 1200]
        area_text = text.split("SEZIONE EFFICACE:")[1].split("PORTATA ARIA:")[0]
        for match in re.finditer(r"^(\d+) ((?:0,\d{3}\s*){9})$", area_text, re.M):
            for width, area in zip(widths, match[2].split()):
                variant((width, int(match[1])), "PDF pagina 3: sezione efficace")["effectiveAreaM2"] = number(area)
        flow_text = text.split("PORTATA ARIA:")[1].split("RUMOROSITA")[0]
        flow_rows = []
        for line in flow_text.splitlines():
            values = line.split()
            if len(values) == 10 and values[0] in ["4", "8"] and all(v.isdigit() for v in values):
                flow_rows.append((None, int(values[0]), list(map(int, values[1:]))))
            elif len(values) == 11 and values[1] == "6" and all(v.isdigit() for v in values):
                flow_rows.append((int(values[0]), 6, list(map(int, values[2:]))))
        if len(flow_rows) != 24:
            raise ValueError("EGA official PDF flow topology changed")
        for i in range(0, len(flow_rows), 3):
            height = flow_rows[i + 1][0]
            for _, velocity, flows in flow_rows[i:i + 3]:
                for width, flow in zip(widths, flows):
                    v = variant((width, height), "PDF pagina 3: portata aria")
                    # Primary PDF supersedes HTML on this family; preserve its exact published values.
                    if velocity == 4:
                        v["operatingPoints"] = []
                    noise = {4: "25/30", 6: "35/40", 8: "45/50"}[velocity]
                    append(v, flow, velocity, {4: "16", 6: "45", 8: "80"}[velocity], noise, use="return")
        source = document
        extra_documents.append(record["htmlSource"])

    # EGA50-3F/4F page 2 explicitly gives the external frame as L+60 × H+60.
    # Keep those proven front dimensions separate from the nominal grille size;
    # the drawing does not establish a single body-depth value.
    if code == "EGA50-3F":
        document = next(
            (item for item in record["documents"] if item["filename"].endswith("-0.pdf")),
            None,
        )
        if not document:
            raise ValueError("EGA50-3F dimension drawing is missing")
        digest = hashlib.sha256((SOURCE / document["filename"]).read_bytes()).hexdigest()
        if digest != document["sha256"] or digest != "a0cf28881ef67e23e097c2bfafc0fd16b1da64b0a96880c51e3cf0a27610ab69":
            raise ValueError("EGA50-3F dimension drawing revision changed")
        for dims, v in variants.items():
            width, height = dims
            v["faceWidthMm"], v["faceHeightMm"] = width + 60, height + 60
            v["originalDimensionsMm"] = {
                "L": width,
                "H": height,
                "externalFrameL": width + 60,
                "externalFrameH": height + 60,
            }
            v["dimensionNote"] = (
                "L×H nominali; ingombro esterno cornice L+60 × H+60 mm "
                "pubblicato nella scheda tecnica, pagina 2. "
                "Profondità complessiva non assegnata."
            )
            provenance.setdefault(dims, set()).add(
                "PDF pagina 2: esterno cornice L+60 × H+60 mm"
            )
        supporting_sources.append({
            "sourceMetadata": dict(
                manufacturer="Ecoclima",
                sourceUrl=document["sourceUrl"],
                sourceType="pdf",
                documentRevision=document["label"],
                retrievedAt=document["retrievedAt"],
                importedAt=datetime.now(timezone.utc).isoformat(),
                sha256=document["sha256"],
                page=2,
            )
        })

    # Flag printed anomalies without replacing any manufacturer's number.
    for dims, v in variants.items():
        groups = {}
        for p in v["operatingPoints"]:
            groups.setdefault((p.get("use"), p.get("settingCode")), []).append(p)
        for group in groups.values():
            ordered = sorted((p for p in group if p["velocityMs"]), key=lambda p: p["velocityMs"])
            if len(ordered) < 2:
                continue
            ratios = [p["airflowM3h"] / p["velocityMs"] for p in ordered]
            reference = sorted(ratios)[len(ratios) // 2]
            ambiguous_pair = len(ordered) == 2 and max(ratios) / min(ratios) > 1.1
            for p, ratio in zip(ordered, ratios):
                if ambiguous_pair or abs(ratio / reference - 1) > 0.1:
                    p["quality"] = "review"
                    p["qualityNote"] = ((p["qualityNote"] or "") + " Portata/velocità incoerenti tra righe della stessa configurazione ufficiale; valore originale conservato, richiede verifica produttore.").strip()
            by_flow = sorted((p for p in group if p["throwM"] is not None), key=lambda p: p["airflowM3h"])
            for previous, current in zip(by_flow, by_flow[1:]):
                if current["throwM"] < previous["throwM"] * 0.9:
                    current["quality"] = "review"
                    current["qualityNote"] = ((current["qualityNote"] or "") + " Lancio decrescente al crescere della portata nella stessa configurazione ufficiale; valore conservato per verifica.").strip()
        v["dimensionNote"] += " Fonti: " + "; ".join(sorted(provenance[dims])) + "."
        unique = {json.dumps(p, sort_keys=True): p for p in v["operatingPoints"]}
        v["operatingPoints"] = list(unique.values())

    name = re.sub(r"\s+", " ", record["name"]).strip().replace("�", "°")
    now = datetime.now(timezone.utc).isoformat()
    if not variants:
        return None, dict(code=code, reason="Nessuna dimensione di terminale pubblicata identificata nelle tabelle ufficiali.", source=record["htmlSource"])
    family = dict(manufacturer="Ecoclima", familyCode=code, name=name,
                  description=name, type="grille", mountingType="Secondo installazione prevista dalla scheda ufficiale",
                  use=["supply"] if code in ["EBA", "EBCV", "EBV", "EBIA"] else ["supply", "return"] if code in ["EBL", "EBLR", "EBLS", "EBP", "EBP-T", "EGA50-3S"] else ["return"],
                  isLinearPerMeter=False, image=(record.get("images") or [{}])[0].get("path"),
                  operatingConditions="Portate e velocità esclusivamente pubblicate dal produttore per ciascuna dimensione e configurazione. Intervalli acustici mantenuti con estremo superiore conservativo; perdite di carico pubblicate come intervalli restano senza valore puntuale. Nessuna portata dedotta dalla sezione efficace. Righe quality=review escluse dal dimensionamento automatico.",
                  variants=sorted(variants.values(), key=lambda v: (v["heightMm"], v["widthMm"])),
                  sourceMetadata=dict(manufacturer="Ecoclima", sourceUrl=source["sourceUrl"],
                                      sourceType="pdf" if source["filename"].endswith(".pdf") else "html",
                                      documentRevision=source.get("label"), retrievedAt=source.get("retrievedAt"),
                                      importedAt=now, sha256=source["sha256"], page=3 if code == "EGA" else None),
                  shape="rectangle", geometryNote="Dimensioni nominali o esterno cornice come indicato su ciascuna variante; profondità non pubblicate come dati tabellari restano null.")
    if code == "EGA":
        document = next(item for item in record["documents"] if item["filename"].endswith("-0.pdf"))
        variant((560, 560), "Scheda tecnica EGA 2024, pagina 2: esecuzione controsoffitto 595×595 mm esterno cornice")
        variants[(560, 560)]["dimensionNote"] += " Scheda tecnica EGA 2024, pagina 2: fronte esterno cornice 595×595 mm."
        supporting_sources.append({"sourceMetadata": dict(
            manufacturer="Ecoclima", sourceUrl=document["sourceUrl"], sourceType="pdf",
            documentRevision=document["label"], retrievedAt=document["retrievedAt"],
            importedAt=now, sha256=document["sha256"], page=2,
        )})
    if code == "EGQR":
        document = next(item for item in record["documents"] if item["filename"].endswith("-0.pdf"))
        for item in family["variants"]:
            width, height = item["widthMm"], item["heightMm"]
            item["faceWidthMm"], item["faceHeightMm"] = width + 15, height + 15
            item["bodyDepthMm"] = 22
            item["originalDimensionsMm"] = {
                "L": width, "H": height,
                "installationWidth": width - 5, "installationHeight": height - 5,
                "faceWidth": width + 15, "faceHeight": height + 15,
                "profileDepth": 22,
            }
            item["dimensionNote"] = (
                "Modello nominale L×H; foro di installazione (L−5)×(H−5) mm; "
                "fronte esterno cornice (L+15)×(H+15) mm; profondità di sezione 22 mm. "
                "Scheda tecnica EGQR 2025, pagina 2."
            )
        supporting_sources.append({"sourceMetadata": dict(
            manufacturer="Ecoclima", sourceUrl=document["sourceUrl"], sourceType="pdf",
            documentRevision=document["label"], retrievedAt=document["retrievedAt"],
            importedAt=now, sha256=document["sha256"], page=2,
        )})
    if code == "EGA50":
        document = next(
            item for item in record["documents"] if item["filename"].endswith("-0.pdf")
        )
        for item in family["variants"]:
            width, height = item["widthMm"], item["heightMm"]
            item["faceWidthMm"], item["faceHeightMm"] = width + 60, height + 60
            item["originalDimensionsMm"] = {
                "L": width, "H": height,
                "installationWidth": width - 20, "installationHeight": height - 20,
                "faceWidth": width + 60, "faceHeight": height + 60,
            }
            item["dimensionNote"] = (
                "Ingombro esterno cornice L+60×H+60 mm e foro (L−20)×(H−20) mm, "
                "scheda tecnica EGA50 2023, pagina 2. Profondità non assegnata."
            )
        family["geometryNote"] += (
            " Fronte EGA50 L+60×H+60 mm; vano L−20×H−20 mm, pagina 2."
        )
        supporting_sources.append({"sourceMetadata": dict(
            manufacturer="Ecoclima", sourceUrl=document["sourceUrl"], sourceType="pdf",
            documentRevision=document["label"], retrievedAt=document["retrievedAt"],
            importedAt=now, sha256=document["sha256"], page=2,
        )})
    if code == "EGA50-3S":
        document = record["htmlSource"]
        for item in family["variants"]:
            width, height = item["widthMm"], item["heightMm"]
            item["faceWidthMm"], item["faceHeightMm"] = width + 60, height + 60
            item["originalDimensionsMm"] = {
                "L": width, "H": height,
                "faceWidth": width + 60, "faceHeight": height + 60,
            }
            item["dimensionNote"] = (
                "Fronte esterno cornice L+60×H+60 mm, disegno tecnico frontale "
                "della pagina prodotto EGA50-3S. Profondità dipendente dal modello."
            )
        family["geometryNote"] += (
            " Fronte comune EGA50-3SA/3SE L+60×H+60 mm; la profondità "
            "dipende dal codice di aspirazione/espulsione."
        )
        supporting_sources.append({"sourceMetadata": dict(
            manufacturer="Ecoclima", sourceUrl=document["sourceUrl"], sourceType="html",
            documentRevision=document["label"], retrievedAt=document["retrievedAt"],
            importedAt=now, sha256=document["sha256"], page=None,
        )})
    if code in ["EGZ50", "EGZ100"]:
        document = next(
            item for item in record["documents"] if item["filename"].endswith("-0.pdf")
        )
        for item in family["variants"]:
            width, height = item["widthMm"], item["heightMm"]
            item["faceWidthMm"], item["faceHeightMm"] = width + 60, height + 60
            item["originalDimensionsMm"] = {
                "L": width, "H": height,
                "installationWidth": width - 20, "installationHeight": height - 20,
                "faceWidth": width + 60, "faceHeight": height + 60,
            }
            item["dimensionNote"] = (
                f"Ingombro esterno L+60×H+60 mm e vano (L−20)×(H−20) mm, "
                f"scheda tecnica {code} 2023, pagina 2. Profondità non assegnata."
            )
        family["geometryNote"] += (
            f" Fronte {code} L+60×H+60 mm; vano L−20×H−20 mm, pagina 2."
        )
        supporting_sources.append({"sourceMetadata": dict(
            manufacturer="Ecoclima", sourceUrl=document["sourceUrl"], sourceType="pdf",
            documentRevision=document["label"], retrievedAt=document["retrievedAt"],
            importedAt=now, sha256=document["sha256"], page=2,
        )})
    if supporting_sources:
        family["supportingSources"] = supporting_sources
    if code == "EGA1-4":
        model_codes = {"EGA1", "EGA2", "EGA3", "EGA4"}
        family["closureOptions"] = ["EGA1/EGA2: chiusura mediante magnete; solo parete", "EGA3/EGA4: cerniera e chiusura con vite; calamite o pomelli a richiesta"]
    if code == "EGQ1-4":
        model_codes = {"EGQ1", "EGQ2", "EGQ3", "EGQ4"}
    alternatives = {"EBP": ["EBP", "EBP-R"], "EBP-T": ["EBP-T", "EBP-TR"],
                    "EGA50-3F": ["EGA50-3F", "EGA50-4F"],
                    "EGA50-3S": ["EGA50-3SA", "EGA50-3SE"],
                    "EGQIF": ["EGQIF", "EGQIFB"]}
    if code in alternatives:
        model_codes = set(alternatives[code])
    if code in ["EGQ-PUSH", "EGQR-PUSH", "EGFR-PUSH"]:
        for v in family["variants"]:
            if v["widthMm"] == v["heightMm"] == 595:
                # These are explicitly paired panel/plenum rows, not dimensions inferred from drawings.
                v["originalDimensionsMm"] = dict(L=595, H=595, L1=560, H1=560)
                v["dimensionNote"] += " Plenum ufficiale L1×H1=560×560 mm; non rappresenta dimensioni del frontale."
    if code == "EGA6":
        family["closureOptions"] = ["Chiusura standard mediante vite", "Chiusura con calamite o con sistema push-pull a richiesta"]
    if "PUSH" in code:
        family["closureOptions"] = ["Chiusura push-pull"]
        if code in ["EGQ-PUSH", "EGF-PUSH"]:
            family["closureOptions"].append("Chiusura con vite o con calamite a richiesta")
    if code == "EBL3":
        family["closureOptions"] = ["Controtelaio a cerniere; chiusura mediante meccanismo a vite"]
    if code == "EGA50-3F":
        family["closureOptions"] = ["Chiusura con vite"]
    if code in ["EGQR-PUSH", "EGFR-PUSH"]:
        family["mountings"] = ["ceiling"]
        family["mountingType"] = "Controsoffitto a quadrotti"
    if code in ["EBP", "EBP-T"]:
        family["mountingType"] = "Pavimento, griglia pedonabile"
    family["modelCodes"] = sorted(model_codes or {code})
    if code == "EBLR":
        document = next(
            item for item in record["documents"]
            if item["filename"].endswith("-0.pdf")
        )
        family["supportingSources"] = [{"sourceMetadata": dict(
            manufacturer="Ecoclima",
            sourceUrl=document["sourceUrl"],
            sourceType="pdf",
            documentRevision=document["label"],
            retrievedAt=document["retrievedAt"],
            importedAt=now,
            sha256=document["sha256"],
            page=None,
        )}]
        for variant in family["variants"]:
            width, height = variant["widthMm"], variant["heightMm"]
            variant["faceWidthMm"], variant["faceHeightMm"] = width + 15, height + 15
            variant["originalDimensionsMm"] = dict(
                L=width, H=height, faceWidth=width + 15, faceHeight=height + 15
            )
            variant["dimensionNote"] = (
                "Ingombro frontale esterno cornice L+15 × H+15 mm, pubblicato "
                "nella scheda tecnica EBLR 2025, pagina 2. Profondità non assegnata."
            )
        family["geometryNote"] += " EBLR con cornice da 15 mm: ingombro frontale L+15×H+15 mm."
    if code == "EBL":
        document = next(
            item for item in record["documents"]
            if item["filename"].endswith("-0.pdf")
        )
        family["supportingSources"] = [{"sourceMetadata": dict(
            manufacturer="Ecoclima",
            sourceUrl=document["sourceUrl"],
            sourceType="pdf",
            documentRevision=document["label"],
            retrievedAt=document["retrievedAt"],
            importedAt=now,
            sha256=document["sha256"],
            page=None,
        )}]
        family["modelCodeFaceOffsetsMm"] = {
            modelCode: dict(widthMm=-1, heightMm=-1)
            if "EBL-22/" in modelCode
            else dict(widthMm=35, heightMm=35)
            for modelCode in family["modelCodes"]
        }
        family["geometryNote"] += (
            " EBL-20/21 con cornice: fronte L+35×H+35 mm; EBL-22 senza "
            "cornice: L-1×H-1 mm, da applicare dopo la scelta del codice articolo."
        )
    if code == "EGQIF":
        document = next(
            item for item in record["documents"] if item["filename"].endswith("-0.pdf")
        )
        family["mountings"] = ["wall"]
        family["mountingType"] = "Parete, muratura o cartongesso"
        family["geometryNote"] += (
            " Installazione a filo parete; kit piastra specifico per muratura o "
            "cartongesso necessario e non fornito. In muratura non disponibili "
            "le altezze 75 e 100 mm."
        )
        family["supportingSources"] = [{"sourceMetadata": dict(
            manufacturer="Ecoclima",
            sourceUrl=document["sourceUrl"],
            sourceType="pdf",
            documentRevision=document["label"],
            retrievedAt=document["retrievedAt"],
            importedAt=now,
            sha256=document["sha256"],
            page=3,
        )}]
        for variant in family["variants"]:
            variant["faceWidthMm"] = variant["widthMm"]
            variant["faceHeightMm"] = variant["heightMm"]
            variant["originalDimensionsMm"] = {
                "L": variant["widthMm"], "H": variant["heightMm"],
                "faceWidth": variant["widthMm"], "faceHeight": variant["heightMm"],
            }
            variant["dimensionNote"] = (
                "Dimensione frontale L×H indicata nella tavola EGQIF 2025, pagina 3."
            )
    for v in family["variants"]:
        if not v.get("modelCodes"):
            v["modelCodes"] = family["modelCodes"]
        if v.get("connectionDiametersMm"):
            v["dimensionNote"] += " Diametri canale circolare pubblicati: " + ", ".join(map(str, v["connectionDiametersMm"])) + " mm."
    if code == "EBLS":
        document = next(
            item for item in record.get("documents", [])
            if item["filename"].endswith("-0.pdf")
        )
        family["supportingSources"] = [{"sourceMetadata": dict(
            manufacturer="Ecoclima",
            sourceUrl=document["sourceUrl"],
            sourceType="pdf",
            documentRevision=document["label"],
            retrievedAt=document["retrievedAt"],
            importedAt=now,
            sha256=document["sha256"],
            page=None,
        )}]
        for variant in family["variants"]:
            variant["faceWidthMm"] = variant["widthMm"] + 35
            variant["faceHeightMm"] = variant["heightMm"] + 35
            variant["dimensionNote"] += " EBLS 2026, pagine 6–7: fronte cornice L+35 × H+35 mm."
            variant["originalDimensionsMm"] = {
                "L": variant["widthMm"], "H": variant["heightMm"],
                "faceWidth": variant["faceWidthMm"], "faceHeight": variant["faceHeightMm"],
            }
        family["geometryNote"] += " La scheda 2026 indica per EBLS-20/21 con cornice fronte L+35×H+35 mm."
        family["operatingConditions"] += " Vk 1,5 m/s: ripresa con filtro EFEBLS pulito. Vk 3/4/5 m/s: mandata, lancio Vt 0,25 m/s in prossimità del soffitto."
    if code in ["EBL", "EBLR"]:
        family["operatingConditions"] += " Mandata: lancio isotermo Vt 0,25 m/s."
    return family, dict(code=code, variants=len(variants), points=sum(len(v["operatingPoints"]) for v in variants.values()),
                        reviewPoints=sum(p["quality"] == "review" for v in variants.values() for p in v["operatingPoints"]),
                        source=source, supportingSources=extra_documents,
                        warnings=list({json.dumps(w, sort_keys=True): w for w in warnings}.values()),
                        reviewVariants=[v["id"] for v in variants.values() if any(p["quality"] == "review" for p in v["operatingPoints"])],
                        missingOperatingDimensions=[v["id"] for v in variants.values() if not v["operatingPoints"]])


def main():
    records = json.loads((SOURCE / "complete-html-tables.json").read_text(encoding="utf8"))
    families, reports, pending = [], [], []
    for record in records:
        if record["code"] in EXCLUDED or not any(c in ["diffusione/griglie", "diffusione/bocchette"] for c in record["categories"]):
            continue
        source = record["htmlSource"]
        if hashlib.sha256((SOURCE / source["filename"]).read_bytes()).hexdigest() != source["sha256"]:
            raise ValueError("Archived HTML revision mismatch: " + source["filename"])
        family, report = normalize(record)
        (reports if family else pending).append(report)
        if family:
            families.append(family)
            print(report["code"], report["variants"], report["points"], "review", report["reviewPoints"], flush=True)
    ids = [v["id"] for f in families for v in f["variants"]]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate grille variant IDs")
    output = dict(families=families, reports=reports, pending=pending)
    (SOURCE / "normalized-grilles.json").write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf8")


if __name__ == "__main__":
    main()
