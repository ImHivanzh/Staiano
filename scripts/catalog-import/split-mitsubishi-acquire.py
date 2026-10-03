"""Acquire original Mitsubishi split PDFs and deterministic vector text. No OCR."""
import hashlib,json,sys,urllib.request
from datetime import datetime,timezone
from pathlib import Path
import pdfplumber
ROOT=Path(__file__).resolve().parents[2]
DEST=ROOT/'catalog-data/sources/splits';DEST.mkdir(parents=True,exist_ok=True)
SOURCES={
'mitsubishi-ay-2025':'https://climatizzazione.mitsubishielectric.it/sites/default/files/2025-08/MSZ_AY_ITA_web.pdf',
'mitsubishi-mxz-sheet-2024':'https://climatizzazione.mitsubishielectric.it/sites/default/files/2024-11/Scheda%20tecnica%20MXZ-F%20-%20191124.pdf',
'mitsubishi-mxz-combinations':'https://library.mitsubishielectric.co.uk/pdf/download_full/1050',
'mitsubishi-ay-service-25-50':'https://library.mitsubishielectric.co.uk/pdf/download_full/4781',
'mitsubishi-ay-service-15-20':'https://library.mitsubishielectric.co.uk/pdf/download_full/5253',
'mitsubishi-uk-residential-2025':'https://library.mitsubishielectric.co.uk/pdf/download_full/5518',
'mitsubishi-dx-2025':'https://climatizzazione.mitsubishielectric.it/sites/default/files/2025-10/Guida%20Pratica%20DX%20-%20WEB%20-%20Ottobre%202025.pdf',
}
manifest=[]
oldpath=DEST/'mitsubishi-manifest.json'
old=json.loads(oldpath.read_text()) if oldpath.exists() else []
for name,url in SOURCES.items():
 path=DEST/(name+'.pdf');cached=path.exists() and '--refresh' not in sys.argv
 if cached:data=path.read_bytes()
 else:
  req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 StaianoHVAC-SourceImporter/1.0'})
  with urllib.request.urlopen(req,timeout=90) as response:
   data=response.read(150*1024*1024+1)
   if len(data)>150*1024*1024:raise ValueError('Source exceeds 150 MB')
  if not data.startswith(b'%PDF-'):raise ValueError('Expected original PDF')
  path.write_bytes(data)
 textpath=path.with_suffix('.pages.json')
 if cached and textpath.exists():pages=json.loads(textpath.read_text(encoding='utf8'))
 else:
  with pdfplumber.open(path) as pdf:pages=[p.extract_text(x_tolerance=1,y_tolerance=3) or '' for p in pdf.pages]
  textpath.write_text(json.dumps(pages,ensure_ascii=False),encoding='utf8')
  path.with_suffix('.txt').write_text('\n\n'.join(pages),encoding='utf8')
 sha=hashlib.sha256(data).hexdigest();prior=next((x for x in old if x['name']==name and x['sha256']==sha),None)
 manifest.append({'name':name,'sourceUrl':url,'sourceType':'pdf','sha256':sha,'retrievedAt':prior['retrievedAt'] if cached and prior else datetime.now(timezone.utc).isoformat(),'pageCount':len(pages),'bytes':len(data)})
 print(name,len(pages),'pages',len(data),'bytes')
oldpath.write_text(json.dumps(manifest,indent=2),encoding='utf8')

# Factual curation is bound to original PDF bytes. Regional suffixes stay separate.
from decimal import Decimal
import re
from collections import Counter
sources_by_name={x['name']:x for x in manifest}
REVIEWED_SHA256={
 'mitsubishi-ay-2025':'f93a90f5ddbe8b3ce33511ee1c0e68db14c84308a438355c4d68533a6511710e',
 'mitsubishi-mxz-combinations':'61d4cc7f7611827495bff20e6b015b14589b9dfa5809c7484c9f80200df2b278',
 'mitsubishi-uk-residential-2025':'871c8dcdf4319e2607bd65491167068092e1b55f65a84076c351507fbdac6eb1',
 'mitsubishi-dx-2025':'ff261fb832589686513641c956ddbc4d366547db1a01e525b30374db9e17fb06',
}
for name,expected in REVIEWED_SHA256.items():
 if sources_by_name[name]['sha256']!=expected:raise ValueError('Source changed; manual vector/render review required: '+name)

def metadata(name,page,revision):
 s=sources_by_name[name]
 return {'sourceUrl':s['sourceUrl'],'sourceType':'pdf','revision':revision,'retrievedAt':s['retrievedAt'],'importedAt':s['retrievedAt'],'sha256':s['sha256'],'page':page}
def watts(v):return int(Decimal(v.replace(',','.'))*1000)
def product_id(size,suffix):return 'mitsubishi-msz-ay'+str(size)+suffix.lower()
sizes=[15,20,25,35,42,50];cool=[1500,2000,2500,3500,4200,5000];heat=[2000,2500,3200,4000,5200,5500]
italian=json.loads((DEST/'mitsubishi-ay-2025.pages.json').read_text(encoding='utf8'))[18]
uk=json.loads((DEST/'mitsubishi-uk-residential-2025.pages.json').read_text(encoding='utf8'))[52]
# Fail closed when source rows change; values are reviewed from these exact rows.
assert '250 x 760 x 199 250 x 760 x 199 299 x 798 x 245' in italian
assert '760 x 199 x 250 760 x 199 x 250 798 x 245 x 299' in uk
assert 'MSZ-AY15VGK MSZ-AY20VGK MSZ-AY25VGK MSZ-AY35VGK MSZ-AY42VGK MSZ-AY50VGK' in uk
indoor=[];combinations=[];quarantine=[]
for suffix,region,src,page,rev in [('VGKP','Italy','mitsubishi-ay-2025',19,'MSZ-AY brochure I-2508282 (2025)'),('VGK','UK','mitsubishi-uk-residential-2025',53,'2025 Residential Product Catalogue V8')]:
 for i,size in enumerate(sizes):
  indoor.append({'id':product_id(size,suffix),'manufacturer':'Mitsubishi Electric','family':'MSZ-AY','model':f'MSZ-AY{size}{suffix}','sizeClass':str(size),'nominalCoolingW':cool[i],'nominalHeatingW':heat[i],'widthMm':760 if size<=20 else 798,'heightMm':250 if size<=20 else 299,'depthMm':199 if size<=20 else 245,'region':region,'notes':'Codice regionale mantenuto identico al documento; disponibilità commerciale italiana da verificare.' if region=='UK' else 'Taglia15 solo multisplit. Potenze nominali EN14511; non Pdesign stagionale.','sourceMetadata':metadata(src,page,rev)})
  if size>15:
   combinations.append({'id':f'mitsubishi-mono-ay{size}-{suffix.lower()}','manufacturer':'Mitsubishi Electric','mode':'mono','outdoorModel':f'MUZ-AY{size}VG','indoorProductIds':[product_id(size,suffix)],'coolingCapacityW':cool[i],'heatingCapacityW':heat[i],'indoorCoolingW':[cool[i]],'indoorHeatingW':[heat[i]],'minIndoorUnits':1,'maxIndoorUnits':1,'maxConnectedCapacityW':None,'approved':True,'region':region,'notes':'Abbinamento monosplit esplicito nella scheda originale. Capacità nominali EN14511.','sourceMetadata':metadata(src,page,rev)})
# The table headings, not its inconsistent index, identify the exact outdoor SKU.
allowed={'MXZ-2F33VF4':(2,5000),'MXZ-2F42VF4':(2,6000),'MXZ-2F53VF4':(2,7500),'MXZ-3F54VF4':(3,10000),'MXZ-3F68VF4':(3,12000),'MXZ-4F72VF4':(4,12500),'MXZ-5F102VF2':(5,17200),'MXZ-6F120VF2':(6,18000)}
pages=json.loads((DEST/'mitsubishi-mxz-combinations.pages.json').read_text(encoding='utf8'));current=None
seen=set()
for page_no,text in enumerate(pages,1):
 if page_no<=2:continue
 for line in text.splitlines():
  if re.fullmatch(r'MXZ-[0-9A-Z]+',line.strip()):current=line.strip();continue
  match=re.match(r'^(\d{2}(?:\+\d{2})+)\s+(.+)$',line)
  if not match or current not in allowed:continue
  classes=[int(x) for x in match[1].split('+')]
  if not all(x in sizes for x in classes):continue
  n=len(classes);maxunits,connected=allowed[current]
  if not 2<=n<=maxunits:quarantine.append({'outdoorModel':current,'page':page_no,'row':line,'reason':'Invalid unit count'});continue
  pairs=re.findall(r'(\d+(?:\.\d+)?)(\*)?\s*/\s*(\d+(?:\.\d+)?)(\*)?',match[2])
  if len(pairs)!=n:quarantine.append({'outdoorModel':current,'page':page_no,'row':line,'reason':'Capacity cell count does not equal connected units'});continue
  # Asterisks mark the manufacturer correction. Unexpected classes are quarantined.
  if any((a or b) and size not in [42,50] for size,(_,a,_,b) in zip(classes,pairs)):
   quarantine.append({'outdoorModel':current,'page':page_no,'row':line,'reason':'Manufacturer asterisk occurs on an unsupported class'});continue
  cw=[];hw=[];factors=[]
  for size,(c,star_c,h,star_h) in zip(classes,pairs):
   factor=Decimal('0.9') if size==42 and star_c else Decimal('0.8') if size==50 and star_c else Decimal(1)
   # Published footnote modifies cooling only; heating remains the original value.
   cw.append(int(Decimal(c)*1000*factor));hw.append(watts(h));factors.append(str(factor))
  # Some pages also repeat separate cooling/heating columns. Cross-check them.
  remainder=re.sub(r'(\d+(?:\.\d+)?)(\*)?\s*/\s*(\d+(?:\.\d+)?)(\*)?','',match[2]).replace('-/-','')
  scalars=re.findall(r'(?<![\w.])\d+(?:\.\d+)?',remainder)
  base=[c for c,_,_,_ in pairs]+[h for _,_,h,_ in pairs]
  if scalars and (len(scalars)!=2*n or any(Decimal(a)!=Decimal(b) for a,b in zip(scalars,base))):
   quarantine.append({'outdoorModel':current,'page':page_no,'row':line,'reason':'Repeated numeric columns disagree or are malformed'});continue
  key=(current,tuple(classes))
  if key in seen:raise ValueError('Duplicate exact combination '+str(key))
  seen.add(key)
  notes='Combinazione esatta pubblicata; capacità simultanee per unità tratte dalla matrice, sommate per il totale, non dedotte dalla somma delle taglie. SKU UK VGK mantenuto; nessuna equivalenza automatica con VGKP italiano o VGK2.'
  if any(f!='1' for f in factors):notes+=' Raffrescamento AY42/AY50 con asterisco corretto secondo nota originale: ×0,90/×0,80; riscaldamento invariato.'
  combinations.append({'id':'mitsubishi-multi-'+current.lower()+'-'+match[1].replace('+','-'),'manufacturer':'Mitsubishi Electric','mode':'multi','outdoorModel':current,'indoorProductIds':[product_id(s,'VGK') for s in classes],'coolingCapacityW':sum(cw),'heatingCapacityW':sum(hw),'indoorCoolingW':cw,'indoorHeatingW':hw,'minIndoorUnits':2,'maxIndoorUnits':maxunits,'maxConnectedCapacityW':connected,'approved':True,'region':'UK','notes':notes,'sourceMetadata':metadata('mitsubishi-mxz-combinations',page_no,'Multi Split Systems Combination Tables, manufacturer library document1050'),'secondarySourceMetadata':[metadata('mitsubishi-uk-residential-2025',53,'2025 Residential Product Catalogue V8'),metadata('mitsubishi-dx-2025',16,'Guida pratica DX ottobre2025: limiti connessione outdoor identico')],'rawCapacityPairs':[[c,h] for c,_,h,_ in pairs],'coolingCorrectionFactors':factors,'originalCombinationClasses':classes})
curation={'manufacturer':'Mitsubishi Electric','scope':'Italy mono VGKP and UK exact multisplit VGK; suffixes never substituted','indoorUnits':indoor,'combinations':combinations,'quarantinedRows':quarantine,'notes':['Multisplit compatibility is an explicit approved row, never merely summed indoor capacity.','Combined indoor maximum current must not exceed3A: AY current per guide .17/.20/.30/.30/.30/.30A; six AY units remain under3A.','UK index calls3F68VFA but individual table heading and UK product catalogue specify3F68VF4: individual source heading is retained.','4F83 omitted: combination table heading VF4 conflicts with catalogue VF2 and Italian4F80; exact identity unresolved.','Published component totals can differ from nominal outdoor rating; allocation values are the source-of-truth for simultaneous operation.']}
assert len(indoor)==12 and len({x['id'] for x in combinations})==len(combinations)
assert all(len(x['indoorProductIds'])==len(x['indoorCoolingW'])==len(x['indoorHeatingW']) for x in combinations)
assert all(x['coolingCapacityW']==sum(x['indoorCoolingW']) and x['heatingCapacityW']==sum(x['indoorHeatingW']) for x in combinations)
(ROOT/'catalog-data/curation/split-mitsubishi.json').write_text(json.dumps(curation,ensure_ascii=False,indent=2),encoding='utf8')
print('CURATION',len(indoor),'indoor',len(combinations),'approved',len(quarantine),'quarantined',dict(Counter(x['outdoorModel'] for x in combinations if x['mode']=='multi')))
