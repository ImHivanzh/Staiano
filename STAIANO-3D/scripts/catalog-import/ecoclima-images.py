"""Mirror selected official product images for the offline technical gallery."""
import hashlib,json,re,urllib.request
from datetime import datetime,timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'catalog-data/sources/ecoclima'
DEST=ROOT/'public/catalog'
DEST.mkdir(parents=True,exist_ok=True)
records=json.loads((SOURCE/'discovery.json').read_text(encoding='utf8'))
images={}
for record in records:
    code=record['code']
    if code in images: continue
    prefix=code+'-'+hashlib.sha256(record['pageUrl'].encode()).hexdigest()[:8]
    html=(SOURCE/(prefix+'.html')).read_text(encoding='utf8')
    urls=[u for u in re.findall(r'<img[^>]+(?:src|data-src)=[\x22\x27]([^\x22\x27]+)',html) if u.startswith('https://www.ecoclima.com/') and '550_550' in u]
    if not urls: continue
    url=urls[0]
    with urllib.request.urlopen(url,timeout=30) as response: data=response.read(5*1024*1024+1)
    if len(data)>5*1024*1024: raise ValueError('Image exceeds 5 MB')
    extension='.png' if data.startswith(b'\x89PNG\r\n\x1a\n') else '.jpg' if data.startswith(b'\xff\xd8') else None
    if not extension: raise ValueError('Unsupported image content')
    filename=code.lower()+extension; (DEST/filename).write_bytes(data)
    images[code]={'path':'/catalog/'+filename,'sourceUrl':url,'sha256':hashlib.sha256(data).hexdigest(),'retrievedAt':datetime.now(timezone.utc).isoformat()}
    print(code,filename,len(data))
(DEST/'image-sources.json').write_text(json.dumps(images,indent=2),encoding='utf8')
