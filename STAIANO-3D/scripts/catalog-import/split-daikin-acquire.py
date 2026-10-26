"""Deterministic Daikin mono/multi extraction. No OCR, no estimated capacities."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib,json,re,urllib.request
import pdfplumber
ROOT=Path(__file__).resolve().parents[2]
DEST=ROOT/'catalog-data/sources/splits';DEST.mkdir(parents=True,exist_ok=True)
URL='https://www.daikin.it/content/dam/DACI-Internet/Download/residenziale/20251117%20Tabelle%20di%20Combinazione%202025_%2017-11.pdf'
PATH=DEST/'daikin-combinations.pdf'
if not PATH.exists():
 with urllib.request.urlopen(URL,timeout=60) as response: data=response.read(20*1024*1024+1)
 if len(data)>20*1024*1024 or not data.startswith(b'%PDF-'):raise ValueError('Invalid manufacturer PDF')
 PATH.write_bytes(data)
SHA=hashlib.sha256(PATH.read_bytes()).hexdigest()
EXPECTED='b64d191043def7bd9c7aa0334bacb46cbfe1647d922ab1a35f703254428c6a38'
if SHA!=EXPECTED:raise ValueError('Source changed: review the extracted tables before importing')
cache=PATH.with_suffix('.pages.json')
if cache.exists():pages=json.loads(cache.read_text(encoding='utf8'))
else:
 with pdfplumber.open(PATH) as pdf:pages=[p.extract_text(x_tolerance=1,y_tolerance=3)or'' for p in pdf.pages]
 cache.write_text(json.dumps(pages,ensure_ascii=False),encoding='utf8')
PATH.with_suffix('.txt').write_text('\n\n'.join(pages),encoding='utf8')
manifest_path=DEST/'daikin-manifest.json'
now=datetime.now(timezone.utc).isoformat()
old=json.loads(manifest_path.read_text(encoding='utf8')) if manifest_path.exists() else {}
retrieved=old.get('retrievedAt',now)
manifest={'sourceUrl':URL,'sourceType':'pdf','sha256':SHA,'retrievedAt':retrieved,'pageCount':len(pages),'documentRevision':'17/11/2025'}
manifest_path.write_text(json.dumps(manifest,indent=2),encoding='utf8')
def source(page):return {'manufacturer':'Daikin',**{k:manifest[k] for k in ('sourceUrl','sourceType','sha256','retrievedAt','documentRevision')},'importedAt':now,'page':page}
mono_manifest=next(s for s in json.loads((ROOT/'catalog-data/sources/hvac/manifest.json').read_text(encoding='utf8')) if s['name']=='daikin-residential-2025')
if mono_manifest['sha256']!='a4414ccfb82ba4e6f29c6d456c53ffb7ab2dcb26a48f78be9b9f1fe815d4129a':raise ValueError('Mono source changed')
mono_source={'manufacturer':'Daikin',**{k:mono_manifest[k] for k in ('sourceUrl','sourceType','sha256','retrievedAt')},'documentRevision':'Catalogo Residenziale 2025','importedAt':now,'page':51}
units=[];combinations=[]
# Page51 merged dimensions visually reviewed: CTXM15A..FTXM50A share298x804x252;60/71 share298x997x292.
for size,cool,heat,outdoor in [(15,None,None,None),(20,2000,2500,'RXM20A'),(25,2500,2800,'RXM25A9'),(35,3500,4000,'RXM35A9'),(42,4200,5400,'RXM42A'),(50,5000,5800,'RXM50A9/8'),(60,6000,7000,'RXM60A'),(71,7100,8200,'RXM71A')]:
 model=('CTXM' if size==15 else 'FTXM')+str(size)+'A';id='daikin-'+model.lower()
 unit={'id':id,'manufacturer':'Daikin','family':'Perfera All Seasons','model':model,'sizeClass':str(size),'nominalCoolingW':cool,'nominalHeatingW':heat,'heightMm':298,'widthMm':804 if size<=50 else 997,'depthMm':252 if size<=50 else 292,'sourceMetadata':mono_source}
 units.append(unit)
 if outdoor:combinations.append({'id':'daikin-mono-'+str(size),'manufacturer':'Daikin','mode':'mono','outdoorModel':outdoor,'indoorProductIds':[id],'coolingCapacityW':cool,'heatingCapacityW':heat,'indoorCoolingW':[cool],'indoorHeatingW':[heat],'minIndoorUnits':1,'maxIndoorUnits':1,'maxConnectedCapacityW':None,'approved':True,'notes':'Abbinamento e capacità nominali del catalogo. RXM50A9/8: designazione alternative pubblicata dal produttore; specificare la revisione in fase di ordine.','sourceMetadata':mono_source})
rows={};outside=None;mode=None;quarantined=[];rejected=set()
for page,text in enumerate(pages,1):
 if page>37:break # Multi+ also produces domestic hot water, outside this scope.
 for line in text.splitlines():
  if re.fullmatch(r'[2-5]MXM\d+A\d',line.strip()):outside=line.strip()
  if line.strip() in ['Raffrescamento','Riscaldamento']:mode='cool' if line.strip()=='Raffrescamento' else 'heat'
  match=re.search(r'(?<![\d.])(\d\.\d(?:\+\d\.\d){1,4})\s+(.+)',line)
  if not match or not outside or not mode:continue
  sizes=match[1].split('+');values=match[2].split();ports=int(outside[0]);n=len(sizes)
  if any(v=='---' for v in values[:n]) or not all(re.fullmatch(r'\d+[.,]\d+',v) for v in values[:n]):raise ValueError('Incomplete indoor performance row')
  capacity=[float(v.replace(',','.'))*1000 for v in values[:n]]
  range_values=[float(v.replace(',','.'))*1000 for v in values[ports:ports+3]]
  total=range_values[1]
  key=(outside,match[1]);row=rows.setdefault(key,{'sizes':sizes})
  if not range_values[0]<=range_values[1]<=range_values[2]:
   rejected.add(key);quarantined.append({'outdoorModel':outside,'combination':match[1],'mode':mode,'page':page,'reason':'Manufacturer nominal capacity outside declared min/max range','capacityRangeW':range_values,'rawRow':line})
  if mode in row and row[mode]!=capacity:raise ValueError('Conflicting duplicate manufacturer combination')
  row[mode]=capacity;row[mode+'Total']=total;row[mode+'Max']=range_values[2];row[mode+'Page']=page
for (outside,sizes),row in rows.items():
 if (outside,sizes) in rejected:continue
 if 'cool' not in row or 'heat' not in row:raise ValueError('Missing complementary operating mode: '+outside+' '+sizes)
 ids=['daikin-'+('ctxm' if float(s)==1.5 else 'ftxm')+str(round(float(s)*10))+'a' for s in row['sizes']]
 if not all(any(u['id']==id for u in units) for id in ids):continue
 combinations.append({'id':'daikin-multi-'+outside.lower()+'-'+sizes.replace('.','').replace('+','-'),'manufacturer':'Daikin','mode':'multi','outdoorModel':outside,'indoorProductIds':ids,'coolingCapacityW':row['coolTotal'],'heatingCapacityW':row['heatTotal'],'maxCoolingCapacityW':row['coolMax'],'maxHeatingCapacityW':row['heatMax'],'indoorCoolingW':row['cool'],'indoorHeatingW':row['heat'],'minIndoorUnits':2,'maxIndoorUnits':int(outside[0]),'maxConnectedCapacityW':None,'approved':True,'notes':f"Combinazione esatta approvata. Raffrescamento pagina{row['coolPage']}, riscaldamento pagina{row['heatPage']}; capacità effettive simultanee A/B/C/D/E della tabella, non capacità nominali sommate. Condizioni: interno27°C DB/19°C WB, esterno35°C DB in raffrescamento; interno20°C DB, esterno7°C DB/6°C WB in riscaldamento.",'sourceMetadata':source(row['coolPage'])})
out=ROOT/'catalog-data/curation/split-daikin.json'
previous=json.loads(out.read_text(encoding='utf8')) if out.exists() else {}
by_id={item['id']:item for item in previous.get('combinations',[])}
for item in combinations:
 existing=by_id.get(item['id'])
 if existing and 'maxCoolingCapacityW' in item:
  existing['maxCoolingCapacityW']=item['maxCoolingCapacityW']
  existing['maxHeatingCapacityW']=item['maxHeatingCapacityW']
 elif not existing and 'maxCoolingCapacityW' in item:by_id[item['id']]=item
previous['indoorUnits']=previous.get('indoorUnits',units)
previous['outdoorUnits']=previous.get('outdoorUnits',[])
previous['combinations']=list(by_id.values())
out.write_text(json.dumps(previous,ensure_ascii=False,indent=2),encoding='utf8')
report={'indoorModels':len(units),'importedCombinations':len(combinations),'quarantinedCombinations':len(rejected),'quarantinedRows':quarantined,'sourceSha256':SHA}
(DEST/'daikin-import-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print('Daikin:',len(units),'indoor models;',len(combinations),'exact approved mono/multi combinations')
print('Quarantined:',len(rejected),'anomalous manufacturer combinations')
