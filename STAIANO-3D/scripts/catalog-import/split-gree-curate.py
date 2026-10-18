"""Normalize vector-source Pular mono and exact Free Match allocations.

Unknown 7K indoor model/dimensions and inconsistent source rows are quarantined.
Manufacturer values remain unrounded, including printed 10 W sum differences.
"""
import hashlib,json,re,math
from decimal import Decimal
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
DEST=ROOT/'catalog-data/sources/splits'
manifest=json.loads((DEST/'gree-manifest.json').read_text(encoding='utf8'))
sources={s['name']:s for s in manifest}
reviewedHashes={'gree-pular-2026':'4115411e1d3a24b7b60f4b0452f04d9e0ab95d95d88c02eeb091307a7d45522d','gree-free-match-2026':'dcedf84907d6d72a90b38103c6f7a9fa10738dc68568e66326814a01e8a4dc3f'}
for name,digest in reviewedHashes.items():
 assert sources[name]['sha256']==digest, 'New source revision requires review: '+name
 assert hashlib.sha256((DEST/(name+'.pdf')).read_bytes()).hexdigest()==digest, 'Source PDF hash mismatch: '+name
def metadata(name,page):
 source=sources[name]
 return {'manufacturer':'Gree','sourceUrl':source['sourceUrl'],'sourceType':'pdf','sourceRevision':'2026','documentRevision':'Brochure 2026' if name=='gree-pular-2026' else 'Scheda prodotto 2026','retrievedAt':source['retrievedAt'],'importedAt':source['retrievedAt'],'sha256':source['sha256'],'page':page}
def watts(value):return int(Decimal(value.replace(',','.'))*1000)
pages=json.loads((DEST/'gree-pular-2026.pages.json').read_text(encoding='utf8'))
specs=[
 ('09','GWH09AGBXB-K6DNA1B/I','GWH09AWBXB-K6DNA1C/O',2700,2800,779,260,185,14),
 ('12','GWH12AGCXB-K6DNA1H/I','GWH12AWCXB-K6DNA3E/O',3200,3400,825,293,196,14),
 ('18','GWH18AGD-K6DNA1D/I','GWH18AGD-K6DNA1D/O',4600,5200,982,311,221,15),
 ('24','GWH24AGD-K6DNA1C/I','GWH24AGD-K6DNA1C/O',6200,6500,982,311,221,15),
]
units=[];combinations=[]
for size,model,outdoor,cool,heat,width,height,depth,page in specs:
 text=pages[page-1]
 assert model in text and outdoor in text
 assert f'{height}/{width}/{depth}' in text
 assert str(cool//1000)+','+str((cool%1000)//10).zfill(2) in text
 capacityLine=next(l for l in text.splitlines() if l.startswith('kW ') and '(' in l)
 capacityValues=re.findall(r'(\d+[,.]\d+) \(',capacityLine)
 assert [watts(n) for n in capacityValues]==([2700,2800,3200,3400] if page==14 else [4600,5200,6200,6500])
 uid='gree-pular-'+size
 units.append({'id':uid,'manufacturer':'Gree','family':'Pular New' if size in ['09','12'] else 'Pular','model':model,'sizeClass':int(size),'nominalCoolingW':cool,'nominalHeatingW':heat,'widthMm':width,'heightMm':height,'depthMm':depth,'sourceMetadata':metadata('gree-pular-2026',page)})
 combinations.append({'id':'gree-pular-mono-'+size,'manufacturer':'Gree','mode':'mono','outdoorModel':outdoor,'indoorProductIds':[uid],'coolingCapacityW':cool,'heatingCapacityW':heat,'indoorCoolingW':[cool],'indoorHeatingW':[heat],'minIndoorUnits':1,'maxIndoorUnits':1,'maxConnectedCapacityW':None,'approved':True,'notes':['Abbinamento e capacità nominali EN14511 pubblicati nella brochure Pular 2026.'],'sourceMetadata':metadata('gree-pular-2026',page)})
matching=json.loads((DEST/'gree-free-match-2026.pages.json').read_text(encoding='utf8'))
def rows(page):
 out=[]
 for line in matching[page-1].splitlines():
  m=re.match(r'^(\d+[Kk](?:\+\d+[Kk])+)[ ]+(.*)',line)
  if not m:continue
  sizes=[int(s[:-1]) for s in m[1].split('+')]
  numbers=re.findall(r'(?<!\S)\d+(?:[,.]\d+)?(?!\S)',m[2])
  if len(numbers)<len(sizes)+3:raise ValueError('Short source row: '+line)
  capacities=[watts(n) for n in numbers[:len(sizes)]]
  total=watts(numbers[len(sizes)+1])
  out.append({'sizes':sizes,'capacities':capacities,'total':total,'sourcePage':page,'rawLine':line})
 return out
def extract(mode):
 rowlist=rows(9 if mode=='cooling' else 10)
 blocks=[];current=[]
 for row in rowlist:
  if row['sizes']==[7,7] and current:blocks.append(current);current=[]
  current.append(row)
 blocks.append(current)
 assert [len(b) for b in blocks]==[5,6,17,23], [len(b) for b in blocks]
 result={}
 for outdoor,block in zip([14,18,21,24],blocks):
  for row in block:result.setdefault((outdoor,tuple(row['sizes'])),[]).append(row)
 for outdoor,pageList in [(28,[11 if mode=='cooling' else 12]),(36,[13 if mode=='cooling' else 14]),(42,[15,17] if mode=='cooling' else [16,18])]:
  for page in pageList:
   for row in rows(page):result.setdefault((outdoor,tuple(row['sizes'])),[]).append(row)
 return result
cooling=extract('cooling');heating=extract('heating');quarantine=[];rawMatrices=[]
for key in sorted(set(cooling)|set(heating)):
 outdoor,sizes=key;coolRows=cooling.get(key,[]);heatRows=heating.get(key,[])
 reasons=[]
 if len(coolRows)!=1 or len(heatRows)!=1:reasons.append('Matching cooling/heating rows missing or duplicated')
 if any(size not in [9,12,18,24] for size in sizes):reasons.append('7K Pular indoor exact model and dimensions not acquired')
 for mode,sourceRows in [('cooling',coolRows),('heating',heatRows)]:
  if len(sourceRows)!=1:continue
  row=sourceRows[0];capacities=row['capacities']
  if abs(sum(capacities)-row['total'])>len(sizes)*10:reasons.append(mode+': printed allocations inconsistent with total')
  if any(sizes[i]==sizes[j] and abs(capacities[i]-capacities[j])>10 for i in range(len(sizes)) for j in range(i+1,len(sizes))):reasons.append(mode+': equal-size allocations inconsistent')
  if any(sizes[i]<sizes[j] and capacities[i]>capacities[j]+10 for i in range(len(sizes)) for j in range(i+1,len(sizes))):reasons.append(mode+': allocations inconsistent with size order')
 record={'outdoorModel':f'GWHD({outdoor})NK6OO','sizes':list(sizes),'cooling':coolRows,'heating':heatRows}
 rawMatrices.append(record)
 if reasons:quarantine.append({**record,'reasons':reasons});continue
 cool=coolRows[0];heat=heatRows[0]
 combinations.append({'id':'gree-free-match-'+str(outdoor)+'-'+'-'.join(map(str,sizes)),'manufacturer':'Gree','mode':'multi','outdoorModel':record['outdoorModel'],'indoorProductIds':['gree-pular-'+str(s).zfill(2) for s in sizes],'coolingCapacityW':cool['total'],'heatingCapacityW':heat['total'],'indoorCoolingW':cool['capacities'],'indoorHeatingW':heat['capacities'],'minIndoorUnits':2,'maxIndoorUnits':2 if outdoor in [14,18] else 3 if outdoor in [21,24] else 4 if outdoor in [28,36] else 5,'maxConnectedCapacityW':None,'approved':True,'notes':['Capacità totali e per unità interna trascritte dalla matrice Free Match 2026; nessuna ripartizione stimata.','Compatibilità famiglia Pular pubblicata nelle pagine 1/4 della stessa fonte; modelli indoor dalla brochure Pular 2026.','Le potenze stampate sono arrotondate dal produttore; la somma può differire dalla nominale totale di pochi watt.'],'sourceMetadata':metadata('gree-free-match-2026',cool['sourcePage']),'heatingSourceMetadata':metadata('gree-free-match-2026',heat['sourcePage']),'sourceRows':{'cooling':cool['rawLine'],'heating':heat['rawLine']}})
payload={'manufacturer':'Gree','revision':'2026','indoorUnits':units,'combinations':combinations,'quarantined':quarantine,'rawMatrices':rawMatrices,'limitations':['Copertura indoor parete Pular 9K/12K/18K/24K. La taglia 7K è esclusa finché modello e dimensioni non sono verificati.','Righe mancanti/duplicate o allocazioni incoerenti della fonte sono escluse dal dimensionamento.','Matrice valida per la famiglia Pular pubblicata nel catalogo 2026. Nessuna interpolazione di combinazioni assenti.']}
assert len({c['id'] for c in combinations})==len(combinations)
for combo in combinations:
 assert len(combo['indoorProductIds'])==len(combo['indoorCoolingW'])==len(combo['indoorHeatingW'])
 assert combo['minIndoorUnits']<=len(combo['indoorProductIds'])<=combo['maxIndoorUnits']
 assert all(math.isfinite(n) and n>0 for n in combo['indoorCoolingW']+combo['indoorHeatingW']+[combo['coolingCapacityW'],combo['heatingCapacityW']])
lookup={c['id']:c for c in combinations}
assert lookup['gree-free-match-14-9-12']['indoorCoolingW']==[1760,2340]
assert lookup['gree-free-match-14-9-12']['indoorHeatingW']==[1890,2510]
assert lookup['gree-free-match-42-9-12-18-24']['indoorCoolingW']==[1910,2550,3820,3820]
# Source page 17 appears to transpose two labels; quarantine both suspect rows.
for key in ['gree-free-match-42-9-12-18-24']:
 combo=lookup[key]
 combinations.remove(combo)
 quarantine.append({'outdoorModel':combo['outdoorModel'],'sizes':[9,12,18,24],'reasons':['Cooling source page 17 shows 18K and 24K with equal capacities; companion 9K+12K+18K+18K row has unequal equal-size capacities. Suspected transposed row labels; no correction inferred.'],'cooling':cooling[(42,(9,12,18,24))],'heating':heating[(42,(9,12,18,24))]})
(ROOT/'catalog-data/curation/split-gree.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf8')
print('Gree:',len(units),'indoor,',len(combinations),'approved combinations,',len(quarantine),'quarantined matrix entries')
