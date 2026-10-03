"""Extract vector PDF table cells, preserving merged manufacturer values."""
import json
from pathlib import Path
import pdfplumber
ROOT=Path(__file__).resolve().parents[2]/'catalog-data/sources/ecoclima'
record=next(r for r in json.loads((ROOT/'discovery.json').read_text(encoding='utf8')) if r['code']=='EVVMC')
document=record['documents'][0]
with pdfplumber.open(ROOT/document['filename']) as pdf:
    tables=pdf.pages[1].extract_tables()
if len(tables)!=1 or len(tables[0][0])!=5: raise ValueError('Unexpected EVVMC table topology')
points=[]; model=None; flow=None
for row in tables[0][1:]:
    if row[0] is not None: model=row[0]
    if row[1] is not None: flow=float(row[1])
    if model is None or flow is None: raise ValueError('Missing merged-cell label')
    if any(row[i] is None for i in [2,3,4]): raise ValueError('Incomplete operating point')
    points.append({'model':model,'airflowM3h':flow,'openingMm':float(row[2]),'pressureDropPa':float(row[3]),'noiseDbA':float(row[4])})
(ROOT/'evvmc-operating-points.json').write_text(json.dumps({'source':document,'points':points},indent=2),encoding='utf8')
print('Extracted',len(points),'operating rows from official EVVMC/EVVMB PDF.')
