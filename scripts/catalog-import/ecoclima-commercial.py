"""Acquire original published commercial tables as isolated catalogue metadata.

The sizing engine does not import or read this file. Price values are not used
to rank technical solutions. No document or browser script is executed.
"""
import argparse
import datetime as dt
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import subprocess
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / 'catalog-data/sources/ecoclima'


class Tables(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tables = []
        self.table = self.row = self.cell = None

    def handle_starttag(self, tag, attrs):
        if tag == 'table':
            self.table = []
        elif tag == 'tr' and self.table is not None:
            self.row = []
        elif tag in ('td', 'th') and self.row is not None:
            self.cell = []

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data.strip())

    def handle_endtag(self, tag):
        if tag in ('td', 'th') and self.cell is not None:
            self.row.append(' '.join(self.cell).strip())
            self.cell = None
        elif tag == 'tr' and self.row is not None:
            self.table.append(self.row)
            self.row = None
        elif tag == 'table' and self.table is not None:
            self.tables.append(self.table)
            self.table = None


cli = argparse.ArgumentParser()
cli.add_argument('--apply', action='store_true')
cli.add_argument('--allow-removal', action='store_true')
cli.add_argument('--normalize-prices', action='store_true', help='Normalize preserved official XLSX and HTML sources into the typed BOM catalog')
args = cli.parse_args()
if args.normalize_prices:
    subprocess.run([sys.executable, str(ROOT / 'scripts/catalog-import/ecoclima-price-workbooks.py')], check=True)
    command = [sys.executable, str(ROOT / 'scripts/catalog-import/ecoclima-prices.py')]
    if args.apply:
        command.append('--apply')
    if args.allow_removal:
        command.append('--allow-removal')
    subprocess.run(command, check=True)
    raise SystemExit(0)
records = json.loads((DEST / 'discovery.json').read_text(encoding='utf-8'))
families = []
for record in records:
    req = urllib.request.Request(record['pageUrl'], headers={'User-Agent': 'Staiano-catalog-import/1.0'})
    with urllib.request.urlopen(req, timeout=45) as response:
        data = response.read(30_000_001)
    if len(data) > 30_000_000:
        raise ValueError('Original page exceeds limit')
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    digest = hashlib.sha256(data).hexdigest()
    identifier = record['code'].lower() + '-' + hashlib.sha256(record['pageUrl'].encode()).hexdigest()[:12]
    raw_path = DEST / f"commercial-{identifier}.html"
    revisions = DEST / 'commercial-revisions'
    revisions.mkdir(exist_ok=True)
    if raw_path.exists():
        previous_data = raw_path.read_bytes()
        previous_digest = hashlib.sha256(previous_data).hexdigest()
        immutable_previous = revisions / f'{identifier}-{previous_digest}.html'
        if not immutable_previous.exists():
            immutable_previous.write_bytes(previous_data)
    immutable_current = revisions / f'{identifier}-{digest}.html'
    if not immutable_current.exists():
        immutable_current.write_bytes(data)
    raw_path.write_bytes(data)
    parser = Tables()
    parser.feed(data.decode('utf-8'))
    tables = [rows for rows in parser.tables if any('€' in cell for row in rows for cell in row)]
    if not tables:
        continue
    if any(len(rows) > 1000 or any(len(row) > 100 or any(len(cell) > 2000 for cell in row) for row in rows) for rows in tables):
        raise ValueError('Commercial table structure exceeds limit')
    families.append({'id': identifier, 'familyCode': record['code'],
                     'publisherLabel': ' '.join(record['name'].split()), 'currency': 'EUR',
                     'tables': tables, 'sourceMetadata': {
                         'manufacturer': 'Ecoclima', 'sourceUrl': record['pageUrl'],
                         'sourceType': 'html', 'documentRevision': None,
                         'retrievedAt': now, 'importedAt': now, 'sha256': digest, 'page': None,
                     }})
    print(json.dumps({'family': record['code'], 'tables': len(tables),
                      'rows': sum(len(rows) for rows in tables), 'sha256': digest}))
target = ROOT / 'catalog-data/generated/ecoclima-commercial.json'
version = 'commercial-' + hashlib.sha256(json.dumps([{'familyCode': f['familyCode'], 'tables': f['tables']} for f in families], sort_keys=True).encode()).hexdigest()[:12]
snapshot = {'version': version, 'families': families}
previous = json.loads(target.read_text(encoding='utf-8')) if target.exists() else None
key = lambda record: record['sourceMetadata']['sourceUrl']
old = {key(record): record for record in previous['families']} if previous else {}
new = {key(record): record for record in families}
report = {'pages': len(families), 'added': [url for url in new if url not in old],
          'removed': [url for url in old if url not in new],
          'changed': [url for url in new if url in old and new[url]['tables'] != old[url]['tables']], 'errors': 0}
target.with_name('ecoclima-commercial.staging.json').write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
target.with_name('ecoclima-commercial.report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report))
if args.apply:
    if report['removed'] and not args.allow_removal:
        raise ValueError('Removed original pages. Review before applying.')
    if target.exists():
        target.with_name('ecoclima-commercial.previous.json').write_bytes(target.read_bytes())
    target.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
else:
    print('Staged only. Review report, then --apply.')
print(json.dumps({'familiesWithPublishedPrices': len(families), 'version': version}))
