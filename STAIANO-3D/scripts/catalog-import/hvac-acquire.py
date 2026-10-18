"""Acquire official HVAC source PDFs and extract vector text/tables locally."""
import hashlib,json,re,urllib.request,sys
from datetime import datetime,timezone
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urljoin
import pdfplumber
ROOT=Path(__file__).resolve().parents[2]
DEST=ROOT/'catalog-data/sources/hvac';DEST.mkdir(parents=True,exist_ok=True)
class Links(HTMLParser):
 def __init__(self):super().__init__();self.links=[];self.href=None;self.label=[]
 def handle_starttag(self,tag,attrs):
  if tag=='a':self.href=dict(attrs).get('href');self.label=[]
 def handle_data(self,data):
  if self.href:self.label.append(data)
 def handle_endtag(self,tag):
  if tag=='a' and self.href:self.links.append((self.href,' '.join(self.label).strip()));self.href=None
def fetch(url):
 with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 StaianoHVAC-CatalogImporter/0.2'}),timeout=40) as response:
  data=response.read(200*1024*1024+1)
  if len(data)>200*1024*1024:raise ValueError('Source exceeds200MB')
  return data
sources={'mitsubishi-pead':'https://climatizzazione.mitsubishielectric.it/sites/default/files/documents/import/scheda_tecnica_5027.pdf','daikin-residential-2025':'https://www.daikin.it/content/dam/DACI-Internet/Download/catalogo-generale-2025/202501%20Catalogo%20Residenziale%2020250429.pdf','gree-eu-catalogue':'https://global.gree.com/upload/files/2022/4/2022_EU_Residential_Air_Conditioner_Catalogue.pdf'}
sources['gree-service']='https://service.argoonline.it/area_riservata/WebDocTec/Documents/SER/SM-NEW-U-MATCH_2022.pdf'
sources['gree-technical-sales']='https://gree-bulgaria.com/manuals/service/U-Match_6_technical_sales_guide.pdf'
try:
 url='https://www.greeitalia.it/download';html=fetch(url).decode('utf8',errors='replace');p=Links();p.feed(html)
 candidates=[(urljoin(url,href),label) for href,label in p.links if '.pdf' in href.lower() and ('match' in (href+label).lower() or 'catalogo' in (href+label).lower())]
 (DEST/'gree-discovery.json').write_text(json.dumps(candidates,indent=2),encoding='utf8')
 for i,(url,label) in enumerate(candidates[:12]):print('GREE candidate:',label[:110],url[:250])
except Exception as e: print('GREE discovery unavailable:',type(e).__name__)
manifest=[]
oldManifest=json.loads((DEST/'manifest.json').read_text(encoding='utf8')) if (DEST/'manifest.json').exists() else []
for name,url in sources.items():
 try:
  path=DEST/(name+'.pdf');cached=path.exists() and '--refresh' not in sys.argv;data=path.read_bytes() if cached else fetch(url)
  if not data.startswith(b'%PDF-'):raise ValueError('NotPDF')
  if cached and path.with_suffix('.pages.json').exists():pages=json.loads(path.with_suffix('.pages.json').read_text(encoding='utf8'))
  else:
   path.write_bytes(data)
   with pdfplumber.open(path) as pdf:pages=[page.extract_text(x_tolerance=1,y_tolerance=3)or'' for page in pdf.pages]
   path.with_suffix('.pages.json').write_text(json.dumps(pages,ensure_ascii=False),encoding='utf8')
   path.with_suffix('.txt').write_text('\n\n'.join(pages),encoding='utf8')
  sha=hashlib.sha256(data).hexdigest();previous=next((s for s in oldManifest if s['name']==name and s['sha256']==sha),None)
  manifest.append({'name':name,'sourceUrl':url,'sourceType':'pdf','retrievedAt':previous['retrievedAt'] if cached and previous else datetime.now(timezone.utc).isoformat(),'sha256':sha,'pageCount':len(pages)})
  print(name,len(pages),'pages',len(data),'bytes')
 except Exception as e:print(name,'unavailable:',type(e).__name__,str(e)[:140])
(DEST/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')
