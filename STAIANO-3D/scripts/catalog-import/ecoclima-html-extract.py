"""Extract original HTML tables with standard parser; no browser scripts or OCR."""
import json,hashlib
from pathlib import Path
from html.parser import HTMLParser
ROOT=Path(__file__).resolve().parents[2]/'catalog-data/sources/ecoclima'
class Tables(HTMLParser):
 def __init__(self):super().__init__();self.tables=[];self.table=None;self.row=None;self.cell=None
 def handle_starttag(self,tag,attrs):
  if tag=='table':self.table=[]
  elif tag=='tr' and self.table is not None:self.row=[]
  elif tag in ['td','th'] and self.row is not None:self.cell=[]
 def handle_data(self,data):
  if self.cell is not None:self.cell.append(data.strip())
 def handle_endtag(self,tag):
  if tag in ['td','th'] and self.cell is not None:self.row.append(' '.join(self.cell).strip());self.cell=None
  elif tag=='tr' and self.row is not None:self.table.append(self.row);self.row=None
  elif tag=='table' and self.table is not None:self.tables.append(self.table);self.table=None
records=json.loads((ROOT/'discovery.json').read_text(encoding='utf8'))
output={}
for code in ['EADD','EGS']:
 record=next(r for r in records if r['code']==code)
 prefix='complete-'+code.lower()+'-'+hashlib.sha256(record['pageUrl'].encode()).hexdigest()[:8]
 data=(ROOT/(prefix+'.html')).read_bytes();parser=Tables();parser.feed(data.decode('utf8'))
 output[code]={'sourceUrl':record['pageUrl'],'sha256':hashlib.sha256(data).hexdigest(),'tables':parser.tables}
 print(code,len(parser.tables),'tables',json.dumps(parser.tables[:1],ensure_ascii=False)[:3000])
(ROOT/'html-tables.json').write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf8')
