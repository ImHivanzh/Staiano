"""Acquire publisher PDF sources and original family photographs; no OCR/AI.

Run with bundled Python (pdfplumber/pypdf), optionally --refresh.
Existing source snapshots remain stable unless refresh is explicitly requested.
"""
import hashlib
import io
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
import pdfplumber
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / "catalog-data" / "sources"
ASSETS = ROOT / "public" / "catalog-assets" / "radiators"
ASSETS.mkdir(parents=True, exist_ok=True)
SOURCES = {
    "cordivari-lisa22": ("https://www.cordivari.it/wp-content/uploads/2023/10/IT-Cordivari_TEC_Scheda-LISA-22-BIANCO-9010_R44.2025.pdf", "R44.2025", "https://www.cordivari.it/prodotto/radiatore-scaldasalviette-lisa-22-white/"),
    "cordivari-claudia": ("https://www.cordivari.it/wp-content/uploads/2023/10/IT-Cordivari_TEC_Scheda-tecnica-scaldasalviette-Claudia_05-2025.pdf", "05-2025", "https://www.cordivari.it/prodotto/radiatore-scaldasalviette-claudia/"),
    "cordivari-tamara": ("https://www.cordivari.it/wp-content/uploads/2023/10/EN-Cordivari_TEC-Scheda-Tamara-Vertical_N-8-2025.pdf", "N-8-2025", "https://www.cordivari.it/en/prodotto/tamara-vertical/"),
    "zehnder-charleston": ("https://www.zehnder.it/download/e80c0bebc9654d1ea2faa5304a36fc4c", "Listino 06/2026", "https://www.zehnder.it/it/radiatori-decorativi/radiatori/radiatori-idronici/zehnder-charleston-funzionamento-ad-acqua-calda"),
    "zehnder-nova": ("https://www.zehnder.it/download/95c6f47bc56841ea875caa1cd429643e", "Listino 06/2026", "https://www.zehnder.it/it/radiatori-decorativi/radiatori/radiatori-idronici/zehnder-nova-funzionamento-ad-acqua-calda"),
    **{f"zehnder-{name}": (f"https://www.zehnder.it/download/{token}", "Listino Tecnico 06/2026", "https://www.climanext.net/brand/zehnder/") for name, token in {
        "kleo": "2add8fa6f23d4ca3aa0f01f67f70c8a1", "orbis": "40793b245fd84b70a3555976f7939880", "ax": "be80108b6d9845f1809d765587bc1254",
        "jetx": "068ebfcd677a4efe9cb32a78d990c82d", "arteplano": "3a560e1642af45899ccf6c0022e0fb6f", "metropolitan": "0713d3770530497f8188f9e410d842b8",
        "toga": "177d3e4b8edd4d8fb9fec3e5a6c2b7e4", "excelsior": "a75f07c10ef342b6977420e8a583751a",
        # Altre serie idroniche del simulatore Climanext (stesso Listino Tecnico 06/2026); foto = copertina del PDF.
        "turned": "d9940450c2d34b50b4ed88368e265c1c", "zeno": "4c928f1fc5354298910e08b6f5057dac", "aura": "a53c01acfebd4082bc36e64e54abc78d",
        "tetris": "5228d803df5c4d0f87a07ac511dcd869", "klaro": "baeea9935af742da99b5e1d8c57dc836", "ribbon": "78930f05f340483f8f141f283c347839",
        "subway": "9df014064dad429f878ac107b88b790d", "quaro": "2d9fcfee59c4453992cc67567dd74a70", "metropolitanspa": "dbced40106f1455f82fadf64656cfa9e",
        "pera": "d8332de78be744c2aa2b42cb547f27b3", "alban": "67bfbb2f86294407b7ff189655e51aff", "chime": "ae33a4e2f770438bacb4a654cd1263ba",
        "forma": "690e7ed874c04b528d4f3fd6aa07a7d6", "sfera": "3b4d564867ab4c6eb962f50a9c65151c", "yucca": "9cfb6df4fbe84d5189072b85e6209e3e",
        "yuccaasym": "5a53887410e841d08a0a7f0fe8b5d2bf", "finalean": "ba8258dce4784ed0b6c5348e801fbcbc", "vitalospa": "758b44c94c4b470d986ff346983ce5d8",
        "vitalobar": "2ef89306f41c42dc8c5b27c60dd19118", "foliobelt": "563641021b3543eca018fb63d3742640", "foliohybrid": "25a8a8da191a401d938ebd2a3633f801",
        "rodatwist": "2d10451d27424a37bb1e53808ad88ffa", "archibald": "b1019f7944664b239155bfe31e044233", "flowform": "2ff9bdf5731447caa895958ea005f8ed"}.items()},
    "lazzarini-sanremo": ("https://docga.plateforme-services.com/api/download/variant_documents_5d77b642-bd28-4767-97e2-f5b1c210a8a0/i9j4Xef8em2500zJDfUxx-8YCi0v24OZ", "Rev. 6 -02-08-2021", "https://www.lazzariniradiatori.it/en/CLASSIC/SANREMO"),
    "lazzarini-garda": ("https://docga.plateforme-services.com/api/download/variant_documents_2816a35c-5a49-46a0-81e2-7aee4bc61bf1/i9j4Xef8em2500zJDfUxx-8YCi0v24OZ", "Rev. 6 -22-11-2023", "https://www.lazzariniradiatori.it/en/DECORATIVE/GARDA"),
    "lazzarini-empoli": ("https://docga.plateforme-services.com/api/download/variant_documents_8101ed7b-720e-4de1-b70c-f82628f27d21/i9j4Xef8em2500zJDfUxx-8YCi0v24OZ", "Rev. 4 -27-04-2021", "https://www.lazzariniradiatori.it/en/LIVING/Empoli"),
}
PHOTOS = {
    "cordivari-lisa22": "https://www.cordivari.it/wp-content/uploads/2022/10/900x900-lista-COMFORT-LISA-22-WHITE.jpg",
    "cordivari-claudia": "https://www.cordivari.it/wp-content/uploads/2022/10/900x900-lista-RADIATORI-18-claudia.jpg",
    "cordivari-tamara": "https://www.cordivari.it/wp-content/uploads/2022/10/900x900-lista-RADIATORI-127-tamara-vt.jpg",
    "zehnder-charleston": "https://www.zehnder.it/fileadmin/_processed_/f/8/csm_6720_59683d6eef.png",
    "zehnder-nova": "https://www.zehnder.it/download/8e2be592419148e9987df35bdfc875b9",
    # Gamma images published by Climanext for the Zehnder series (same technical sheets as the PDFs).
    **{f"zehnder-{name}": f"https://www.climanext.net/wp-content/uploads/2026/09/zehnder-serie-{slug}-ritaglio-400x300.jpg" for name, slug in {
        "kleo": "kleo", "orbis": "orbis", "ax": "ax", "jetx": "jet-x", "arteplano": "arteplano", "metropolitan": "metropolitan",
        "toga": "toga", "excelsior": "excelsior"}.items()},
}

def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": "StaianoHVAC-CatalogImporter/0.1"})
    with urllib.request.urlopen(request, timeout=40) as response:
        data = response.read(30 * 1024 * 1024 + 1)
    if len(data) > 30 * 1024 * 1024:
        raise ValueError("Source exceeds 30 MB")
    return data

manifest_path = DEST / "radiators-extended-manifest.json"
previous = {s["name"]: s for s in json.loads(manifest_path.read_text(encoding="utf8"))} if manifest_path.exists() else {}
manifest = []
for name, (url, revision, publisher_page) in SOURCES.items():
    target = DEST / f"{name}.pdf"
    if not target.exists() or "--refresh" in sys.argv:
        data = fetch(url)
        if not data.startswith(b"%PDF-"):
            raise ValueError(f"Invalid PDF {url}")
        if target.exists() and data != target.read_bytes():
            target.with_suffix(".previous.pdf").write_bytes(target.read_bytes())
        target.write_bytes(data)
    data = target.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    with pdfplumber.open(target) as pdf:
        pages = [page.dedupe_chars().extract_text(x_tolerance=1, y_tolerance=3) or "" for page in pdf.pages]
    target.with_suffix(".txt").write_text("\n\n".join(pages), encoding="utf8")
    target.with_suffix(".pages.json").write_text(json.dumps(pages, ensure_ascii=False, indent=2), encoding="utf8")
    if name.startswith("lazzarini-"):
        # The publisher's cover contains exactly one original product photograph.
        images = list(PdfReader(target).pages[0].images)
        if len(images) != 1:
            raise ValueError(f"Unexpected cover photo structure in {name}")
        photo_data, extension, photo_url = images[0].data, Path(images[0].name).suffix, url
    elif name not in PHOTOS:
        # Serie senza foto pubblicata da Climanext: la copertina del Listino Tecnico mostra il prodotto (immagine piu' grande).
        covers = sorted(PdfReader(target).pages[0].images, key=lambda i: i.image.width * i.image.height)
        picture = covers[-1].image.convert("RGB")
        picture.thumbnail((1000, 1000))
        buffer = io.BytesIO()
        picture.save(buffer, "JPEG", quality=88)
        photo_data, extension, photo_url = buffer.getvalue(), ".jpg", url
    else:
        photo_url = PHOTOS[name]
        asset = ASSETS / f"{name}{'.png' if name == 'zehnder-charleston' else '.jpg'}"
        photo_data = fetch(photo_url) if not asset.exists() or "--refresh" in sys.argv else asset.read_bytes()
        extension = ".png" if photo_data.startswith(b"\x89PNG") else ".jpg"
    photo_path = ASSETS / f"{name}{extension}"
    photo_path.write_bytes(photo_data)
    old = previous.get(name, {})
    retrieved = old.get("retrievedAt") if old.get("sha256") == digest else datetime.now(timezone.utc).isoformat()
    manifest.append({"name": name, "sourceUrl": url, "publisherPage": publisher_page, "documentRevision": revision, "retrievedAt": retrieved, "sha256": digest, "pageCount": len(pages), "productPhoto": {"localPath": f"/catalog-assets/radiators/{photo_path.name}", "sourceUrl": photo_url, "sha256": hashlib.sha256(photo_data).hexdigest(), "caption": "Fotografia ufficiale di famiglia; dimensioni, finitura e allacciamenti dipendono dal modello selezionato."}})
    print(f"{name}: {len(pages)} pages, photo {photo_path.name}")
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf8")

# Supplemental family images leave old product IDs and catalog versions intact.
legacy_sources = {s["name"]: s for s in json.loads((DEST / "manifest.json").read_text(encoding="utf8"))}
family_photos = {}
for columns in range(2, 7):
    name = f"cordivari-ardesia-{columns}"
    cover_images = list(PdfReader(DEST / f"{name}.pdf").pages[0].images)
    if len(cover_images) != 1:
        raise ValueError(f"Unexpected family photograph {name}")
    data = cover_images[0].data
    filename = f"cordivari-ardesia-{columns}-colonne.jpg"
    (ASSETS / filename).write_bytes(data)
    family_photos[f"Cordivari|Ardesia {columns} colonne"] = {
        "localPath": f"/catalog-assets/radiators/{filename}", "sourceUrl": legacy_sources[name]["sourceUrl"],
        "sha256": hashlib.sha256(data).hexdigest(),
        "caption": "Fotografia ufficiale di famiglia estratta dalla scheda originale, pagina 1; dimensione e finitura dipendono dal modello selezionato."
    }
for family, url in {
    "VIP": "https://www.globalradiatori.it/uploads/blog/00231_16213519640.jpg",
    "OSCAR": "https://www.globalradiatori.it/uploads/blog/00232_16219371540.jpg",
    "OSCAR TONDO": "https://www.globalradiatori.it/uploads/blog/00323_16221941810.jpg",
}.items():
    filename = f"global-{family.lower().replace(' ', '-')}.jpg"
    target = ASSETS / filename
    data = fetch(url) if not target.exists() or "--refresh" in sys.argv else target.read_bytes()
    target.write_bytes(data)
    family_photos[f"Global|{family}"] = {
        "localPath": f"/catalog-assets/radiators/{filename}", "sourceUrl": url,
        "sha256": hashlib.sha256(data).hexdigest(),
        "caption": "Fotografia ufficiale di famiglia dal produttore; dimensione e finitura dipendono dal modello selezionato."
    }
(ROOT / "catalog-data/generated/radiator-family-photos.json").write_text(json.dumps(family_photos, ensure_ascii=False, indent=2), encoding="utf8")
