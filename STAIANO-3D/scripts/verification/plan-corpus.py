"""Download the public test PDFs; optionally regenerate their cropped RGBA fixtures.

Run with the bundled Python runtime (pdfplumber and Pillow are already installed).
The user's private PDF is deliberately excluded from the distributable corpus.
"""
import argparse
import gzip
import hashlib
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "tests/fixtures/plan-recognition"
CACHE = ROOT / "tmp/plan-corpus"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--regenerate", action="store_true")
    args = parser.parse_args()
    samples = json.loads((FIXTURES / "manifest.json").read_text(encoding="utf-8"))
    CACHE.mkdir(parents=True, exist_ok=True)
    sources = {s["pdf"]: s["source"] for s in samples}
    for filename, url in sources.items():
        target = CACHE / filename
        if args.download:
            request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(request, timeout=30) as response:
                content = response.read(32 * 1024 * 1024 + 1)
            if len(content) > 32 * 1024 * 1024 or not content.startswith(b"%PDF-"):
                raise ValueError(f"Invalid PDF: {filename}")
            target.write_bytes(content)
        if not target.is_file():
            raise FileNotFoundError(f"{target}: run with --download first")
        print(f"{filename}: {hashlib.sha256(target.read_bytes()).hexdigest()}")
    if args.regenerate:
        import pdfplumber
        for sample in samples:
            with pdfplumber.open(CACHE / sample["pdf"]) as pdf:
                page = pdf.pages[sample["page"] - 1]
                scale = min(2, 2200 / max(page.width, page.height))
                image = page.to_image(resolution=72 * scale).original.convert("RGBA")
                sample["imageWidth"], sample["imageHeight"] = image.size
                crop = image.crop(sample["region"])
                sample["width"], sample["height"] = crop.size
                raw = crop.tobytes()
                sample["sha256"] = hashlib.sha256(raw).hexdigest()
                (FIXTURES / sample["file"]).write_bytes(gzip.compress(raw, mtime=0))
        (FIXTURES / "manifest.json").write_text(json.dumps(samples, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
