"""Offline normalization of reviewed official Daikin VRV/VRF tables.

The residential catalogue is archived and pinned by SHA-256 under
catalog-data/sources/hvac. Run with the bundled Python (no third-party
dependency beyond the standard library). No capacity is interpolated.
"""
from pathlib import Path
import hashlib
import json
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
PDF = ROOT / "catalog-data/sources/hvac/daikin-residential-2025.pdf"
URL = "https://www.daikin.it/content/dam/DACI-Internet/Download/catalogo-generale-2025/202501%20Catalogo%20Residenziale%2020250429.pdf"
SHA = "a4414ccfb82ba4e6f29c6d456c53ffb7ab2dcb26a48f78be9b9f1fe815d4129a"
REVISION = "Catalogo Residenziale 2025"
RETRIEVED = "2026-10-03T02:41:21.764272+00:00"

if hashlib.sha256(PDF.read_bytes()).hexdigest() != SHA:
    raise ValueError("Source changed: review the VRV tables before regenerating")

out_dir = ROOT / "public/catalog-assets/vrv"


def source(page):
    return dict(
        manufacturer="Daikin",
        sourceUrl=URL,
        sourceType="pdf",
        sha256=SHA,
        documentRevision=REVISION,
        retrievedAt=RETRIEVED,
        importedAt=RETRIEVED,
        page=page,
    )


def photo(name, page, caption):
    path = out_dir / name
    return dict(
        localPath=f"/catalog-assets/vrv/{name}",
        sourceUrl=f"{URL}#page={page}",
        sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
        caption=caption,
    )


vrv5_photo = photo(
    "daikin-vrv-5-s.jpg",
    111,
    "Foto di unità esterna VRV 5 S dal Catalogo Residenziale 2025, pag. 111; il 3D rappresenta l'unità esterna.",
)
vrv4_photo = photo(
    "daikin-vrv-iv-s.jpg",
    108,
    "Foto di unità esterna VRV IV S dal Catalogo Residenziale 2025, pag. 108; il 3D rappresenta l'unità esterna.",
)
fxaa_photo = photo(
    "daikin-fxaa-a.jpg",
    117,
    "Foto di unità interna a parete FXAA-A dal Catalogo Residenziale 2025, pag. 117.",
)

outdoor = []
for model, family, phase, cooling, heating, max_heat, dims, page, photo_ref, refrigerant in [
    ("RXYSCQ4TV1", "VRV IV S Compact", "Monofase 230 V / 50 Hz", 12.1, 12.1, 14.2, (823, 940, 460), 107, vrv4_photo, "R-410A"),
    ("RXYSCQ5TV1", "VRV IV S Compact", "Monofase 230 V / 50 Hz", 14.0, 14.0, 16.0, (823, 940, 460), 107, vrv4_photo, "R-410A"),
    ("RXYSCQ6TV1", "VRV IV S Compact", "Monofase 230 V / 50 Hz", 15.5, 15.5, 18.0, (823, 940, 460), 107, vrv4_photo, "R-410A"),
    ("RXYSQ4TV9", "VRV IV S", "Monofase 230 V / 50 Hz", 12.1, 12.1, 14.2, (1345, 900, 320), 108, vrv4_photo, "R-410A"),
    ("RXYSQ5TV9", "VRV IV S", "Monofase 230 V / 50 Hz", 14.0, 14.0, 16.0, (1345, 900, 320), 108, vrv4_photo, "R-410A"),
    ("RXYSQ6TV9", "VRV IV S", "Monofase 230 V / 50 Hz", 15.5, 15.5, 18.0, (1345, 900, 320), 108, vrv4_photo, "R-410A"),
    ("RXYSQ4TY9", "VRV IV S", "Trifase 400 V / 50 Hz", 12.1, 12.1, 14.2, (1345, 900, 320), 108, vrv4_photo, "R-410A"),
    ("RXYSQ5TY9", "VRV IV S", "Trifase 400 V / 50 Hz", 14.0, 14.0, 16.0, (1345, 900, 320), 108, vrv4_photo, "R-410A"),
    ("RXYSQ6TY9", "VRV IV S", "Trifase 400 V / 50 Hz", 15.5, 15.5, 18.0, (1345, 900, 320), 108, vrv4_photo, "R-410A"),
    ("RXYSQ8TY1", "VRV IV S", "Trifase 400 V / 50 Hz", 22.4, 22.4, 25.0, (1430, 940, 320), 108, vrv4_photo, "R-410A"),
    ("RXYSQ10TY1", "VRV IV S", "Trifase 400 V / 50 Hz", 28.0, 28.0, 31.5, (1615, 940, 460), 108, vrv4_photo, "R-410A"),
    ("RXYSQ12TY1", "VRV IV S", "Trifase 400 V / 50 Hz", 33.5, 33.5, 37.5, (1615, 940, 460), 108, vrv4_photo, "R-410A"),
    ("RXYSA4AV1", "VRV 5 S", "Monofase 230 V / 50 Hz", 12.1, 12.1, 14.2, (869, 1100, 460), 111, vrv5_photo, "R-32"),
    ("RXYSA5AV1", "VRV 5 S", "Monofase 230 V / 50 Hz", 14.0, 14.0, 16.0, (869, 1100, 460), 111, vrv5_photo, "R-32"),
    ("RXYSA6AV1", "VRV 5 S", "Monofase 230 V / 50 Hz", 15.5, 15.5, 18.0, (869, 1100, 460), 111, vrv5_photo, "R-32"),
    ("RXYSA4AY1", "VRV 5 S", "Trifase 400 V / 50 Hz", 12.1, 12.1, 14.2, (869, 1100, 460), 111, vrv5_photo, "R-32"),
    ("RXYSA5AY1", "VRV 5 S", "Trifase 400 V / 50 Hz", 14.0, 14.0, 16.0, (869, 1100, 460), 111, vrv5_photo, "R-32"),
    ("RXYSA6AY1", "VRV 5 S", "Trifase 400 V / 50 Hz", 15.5, 15.5, 18.0, (869, 1100, 460), 111, vrv5_photo, "R-32"),
]:
    outdoor.append(
        dict(
            id=f"daikin-{model.lower()}",
            manufacturer="Daikin",
            family=family,
            model=model,
            coolingW=round(cooling * 1000),
            heatingW=round(heating * 1000),
            maxHeatingW=round(max_heat * 1000),
            minConnectionRatio=50,
            maxConnectionRatio=130,
            widthMm=dims[0],
            heightMm=dims[1],
            depthMm=dims[2],
            dimensionNote=f"Ingombro unità esterna L×H×P da Catalogo Residenziale 2025 pag. {page}. Rapporto di connessione ammesso 50–130% (nota del catalogo). Distanze di servizio da verificare nel manuale.",
            features=[
                "Pompa di calore VRV/VRF" if family != "VRV IV S Compact" else "Mini VRV/VRF",
                refrigerant,
                "Riscaldamento e raffrescamento",
                phase,
                "Unità interne VRV o a parete da abbinare",
            ],
            productPhoto=photo_ref,
            sourceMetadata=source(page),
        )
    )

indoor = []
for model, size, cooling, heating, dims in [
    ("FXAA15A", "15", 1.7, 1.9, (290, 795, 266)),
    ("FXAA20A", "20", 2.2, 2.5, (290, 795, 266)),
    ("FXAA25A", "25", 2.8, 3.2, (290, 795, 266)),
    ("FXAA32A", "32", 3.6, 4.0, (290, 795, 266)),
    ("FXAA40A", "40", 4.5, 5.0, (290, 1050, 269)),
    ("FXAA50A", "50", 5.6, 6.3, (290, 1050, 269)),
    ("FXAA63A", "63", 7.1, 8.0, (290, 1050, 269)),
]:
    indoor.append(
        dict(
            id=f"daikin-{model.lower()}",
            manufacturer="Daikin",
            family="VRV 5 FXAA-A",
            model=model,
            sizeClass=size,
            nominalCoolingW=round(cooling * 1000),
            nominalHeatingW=round(heating * 1000),
            widthMm=dims[1],
            heightMm=dims[0],
            depthMm=dims[2],
            features=["Unità interna a parete VRV 5", "R-32", "Mandata a 5 angolazioni", "Filtro estraibile e lavabile"],
            productPhoto=fxaa_photo,
            sourceMetadata=source(117),
        )
    )

version_hash = hashlib.sha256(
    json.dumps({"outdoorUnits": outdoor, "indoorUnits": indoor}, sort_keys=True, ensure_ascii=False).encode()
).hexdigest()[:16]
catalog = dict(version=f"vrv-{version_hash}", outdoorUnits=outdoor, indoorUnits=indoor)

out = ROOT / "catalog-data/generated/vrv.json"
history_path = out.with_name("vrv-history.json")
history = json.loads(history_path.read_text(encoding="utf8")) if history_path.exists() else {}
if out.exists():
    previous = json.loads(out.read_text(encoding="utf8"))
    if previous["version"] != catalog["version"]:
        history[previous["version"]] = previous
out.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
history_path.write_text(json.dumps(history, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
manifest_path = ROOT / "catalog-data/sources/vrv/manifest.json"
manifest_path.parent.mkdir(parents=True, exist_ok=True)
manifest_path.write_text(
    json.dumps(
        [dict(name="daikin-residential-2025", timestampBasis="source-manifest", **source(None))],
        indent=2,
        ensure_ascii=False,
    )
    + "\n",
    encoding="utf8",
)
print(f"Generated {len(outdoor)} VRV outdoor units and {len(indoor)} indoor units")
