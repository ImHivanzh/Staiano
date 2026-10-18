"""Archive primary manufacturer finish sources used by the local finish catalog."""
from pathlib import Path
from urllib.request import Request, urlopen
from datetime import datetime, timezone
import hashlib
import json

ROOT = Path(__file__).resolve().parent
SOURCES = [
    ('cordivari-colours', 'https://www.cordivari.it/wp-content/uploads/2023/10/Catalogo-Radiatori-e-Scaldasalviette-IT-2025.pdf', 'pdf'),
    ('cordivari-accessory-finishes', 'https://www.cordivari.it/wp-content/uploads/2023/10/IT-Cordivari_TEC_Accessori-e-ricambi-radiatori-e-scaldasalviette_05-2025.pdf', 'pdf'),
    ('zehnder-charleston-finishes', 'https://www.zehnder.it/it/radiatori-decorativi/radiatori/radiatori-idronici/zehnder-charleston-funzionamento-ad-acqua-calda', 'html'),
    ('zehnder-nova-finishes', 'https://www.zehnder.it/it/radiatori-decorativi/radiatori/radiatori-idronici/zehnder-nova-funzionamento-ad-acqua-calda', 'html'),
    ('zehnder-valve-finishes', 'https://www.zehnder.it/download/ec3a121f6ebe42e1904bb545216a0eb1', 'pdf'),
    ('lazzarini-colours', 'https://www.lazzariniradiatori.it/Tabella-colori-Lazzarini', 'html'),
    ('lazzarini-accessory-finishes', 'https://www.lazzariniradiatori.it/Accessori-e-valvole', 'html'),
    ('lazzarini-sanremo-finishes', 'https://www.lazzariniradiatori.it/en/CLASSIC/SANREMO', 'html'),
    ('lazzarini-garda-finishes', 'https://www.lazzariniradiatori.it/en/DECORATIVE/GARDA', 'html'),
    ('lazzarini-empoli-finishes', 'https://www.lazzariniradiatori.it/en/LIVING/Empoli', 'html'),
]

def main():
    manifest = []
    for name, url, kind in SOURCES:
        try:
            with urlopen(Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=45) as response:
                data = response.read()
            path = ROOT / f'{name}.{kind}'
            path.write_bytes(data)
            item = dict(id=name, sourceUrl=url, sourceType=kind, localPath=str(path.relative_to(ROOT.parent.parent)).replace('\\', '/'), retrievedAt=datetime.now(timezone.utc).isoformat(), sha256=hashlib.sha256(data).hexdigest())
            if kind == 'pdf':
                from pypdf import PdfReader
                document = PdfReader(path)
                item['pageCount'] = len(document.pages)
                (ROOT / f'{name}.txt').write_text('\n'.join(page.extract_text() for page in document.pages), encoding='utf-8')
            manifest.append(item)
            print(name, len(data))
        except Exception as error:
            print(name, type(error).__name__, str(error))
    (ROOT / 'radiator-finishes-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

if __name__ == '__main__':
    main()
