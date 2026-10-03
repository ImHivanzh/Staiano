"""Acquire original public Gree Italia split documentation; never OCR or infer data."""
import hashlib,json,sys,urllib.request,urllib.parse
from pathlib import Path
from datetime import datetime,timezone
from html.parser import HTMLParser
import pdfplumber
ROOT=Path(__file__).resolve().parents[2]
DEST=ROOT/'catalog-data/sources/splits';DEST.mkdir(parents=True,exist_ok=True)
def fetch(url,data=None):
 with urllib.request.urlopen(urllib.request.Request(url,data=data,headers={'User-Agent':'Mozilla/5.0 StaianoHVAC-CatalogImporter/0.2'}),timeout=60) as response:
  body=response.read(200*1024*1024+1)
  if len(body)>200*1024*1024:raise ValueError('Source exceeds 200 MB')
  return body
class Links(HTMLParser):
 def __init__(self):super().__init__();self.rows=[];self.href=None;self.label=[]
 def handle_starttag(self,tag,attrs):
  if tag=='a':self.href=dict(attrs).get('href');self.label=[]
 def handle_data(self,data):
  if self.href:self.label.append(data)
 def handle_endtag(self,tag):
  if tag=='a' and self.href:self.rows.append({'url':self.href,'label':' '.join(self.label).strip()});self.href=None
def discover():
 rows=[]
 for category in ['CATALOGHI','GUIDE_TECNICHE_DI_PRODOTTO']:
  html=fetch('https://www.greeitalia.it/download.php?entryPoint=downloaddoc',urllib.parse.urlencode({'category':category}).encode()).decode('utf8',errors='replace')
  (DEST/('gree-discovery-'+category+'.html')).write_text(html,encoding='utf8')
  parser=Links();parser.feed(html)
  for row in parser.rows:
   row['url']=urllib.parse.urljoin('https://www.greeitalia.it/',row['url']);row['category']=category;rows.append(row)
 (DEST/'gree-discovery.json').write_text(json.dumps(rows,indent=2,ensure_ascii=False),encoding='utf8')
 for row in rows:print(row['label'][:130],row['url'])
 return rows
def acquire(sources):
 previous=json.loads((DEST/'gree-manifest.json').read_text(encoding='utf8')) if (DEST/'gree-manifest.json').exists() else []
 manifest=[]
 for name,url in sources.items():
  path=DEST/(name+'.pdf');cached=path.exists() and '--refresh' not in sys.argv
  data=path.read_bytes() if cached else fetch(url)
  if not data.startswith(b'%PDF-'):raise ValueError('Not PDF: '+url)
  path.write_bytes(data)
  if cached and path.with_suffix('.pages.json').exists():pages=json.loads(path.with_suffix('.pages.json').read_text(encoding='utf8'))
  else:
   with pdfplumber.open(path) as pdf:pages=[p.extract_text(x_tolerance=1,y_tolerance=3) or '' for p in pdf.pages]
   path.with_suffix('.pages.json').write_text(json.dumps(pages,ensure_ascii=False),encoding='utf8')
   path.with_suffix('.txt').write_text('\n\n'.join(pages),encoding='utf8')
  digest=hashlib.sha256(data).hexdigest();old=next((r for r in previous if r['name']==name and r['sha256']==digest),None)
  manifest.append({'name':name,'sourceUrl':url,'sourceType':'pdf','sha256':digest,'retrievedAt':old['retrievedAt'] if cached and old else datetime.now(timezone.utc).isoformat(),'pageCount':len(pages)})
  print(name,len(pages),'pages',len(data),'bytes')
 (DEST/'gree-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')
if __name__=='__main__':
 rows=discover()
 if '--discover-only' not in sys.argv:
  sources=json.loads((ROOT/'catalog-data/curation/split-gree-sources.json').read_text(encoding='utf8'))
  acquire(sources)
