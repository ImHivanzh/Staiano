"""Add documented residential series and original product imagery, no guessed multi pairings."""
from pathlib import Path
from datetime import datetime, timezone
import json
import hashlib
import re
import sys
import urllib.request
from urllib.parse import quote
from pypdf import PdfReader
import pdfplumber

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / "public/catalog-assets/splits"
DEST.mkdir(parents=True, exist_ok=True)
now = datetime.now(timezone.utc).isoformat()
units, combinations, series = [], [], []

# Acquisition is explicit; normal generation remains deterministic and offline.
PHOTO_MANIFEST = DEST / "official-images.json"
if "--acquire-images" in sys.argv:
    acquired = {}
    for name, model in [("stylish", "FTXA-CW"), ("emura", "FTXJ-AW"),
                        ("perfera-all-seasons", "FTXM-A"), ("comfora", "FTXP-N9"), ("sensira", "FTXF-E")]:
        page_url = f"https://www.daikin.it/it_IT/cerca-prodotto/product.html/{model}.html"
        html = urllib.request.urlopen(page_url, timeout=30).read().decode("utf8")
        paths = set(re.findall(r'(?:src|data-src)="([^"]+)"', html))
        paths = [p for p in paths if "/IndoorUnits/Packshots/" in p and "cq5dam.web.1280.1280.jpeg" in p]
        if len(paths) != 1:
            raise ValueError(f"Ambiguous original photo: {model}")
        url = "https://www.daikin.it" + quote(paths[0], safe="/:()_.-")
        path = DEST / f"daikin-{name}-official.jpg"
        path.write_bytes(urllib.request.urlopen(url, timeout=30).read())
        acquired[f"daikin-{name}"] = {"localPath": f"/catalog-assets/splits/{path.name}",
            "sourceUrl": url, "sourcePageUrl": page_url, "retrievedAt": now,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
    PHOTO_MANIFEST.write_text(json.dumps(acquired, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
official_photos = json.loads(PHOTO_MANIFEST.read_text(encoding="utf8")) if PHOTO_MANIFEST.exists() else {}


def source(folder, name, brand, page, revision):
    manifest = json.loads((ROOT / folder / "manifest.json").read_text(encoding="utf8")) if folder.endswith("hvac") else json.loads((ROOT / folder / ("gree-manifest.json" if brand == "Gree" else "mitsubishi-manifest.json")).read_text(encoding="utf8"))
    item = next(m for m in manifest if m["name"] == name)
    file = ROOT / folder / f"{name}.pdf"
    if hashlib.sha256(file.read_bytes()).hexdigest() != item["sha256"]: raise ValueError("Source changed: " + name)
    return {"manufacturer": brand, **{k:item[k] for k in ["sourceUrl","sourceType","retrievedAt","sha256"]}, "importedAt":item["retrievedAt"], "documentRevision":revision, "page":page}


def photo(name, filename, page, image_name, meta, caption):
    if name in official_photos:
        item = official_photos[name]
        path = ROOT / "public" / item["localPath"].lstrip("/")
        if hashlib.sha256(path.read_bytes()).hexdigest() != item["sha256"]:
            raise ValueError("Original photo changed: " + name)
        return {k:item[k] for k in ["localPath", "sourceUrl", "sha256"]} | {"caption": caption}
    images = PdfReader(ROOT / filename).pages[page-1].images
    image = next(i for i in images if i.name == image_name)
    path = DEST / f"{name}.png"
    bitmap = image.image
    if bitmap.mode not in ("RGB", "RGBA", "L", "LA", "P"):
        bitmap = bitmap.convert("RGB")
    bitmap.save(path)
    return {"localPath":f"/catalog-assets/splits/{path.name}","sourceUrl":meta["sourceUrl"],"sha256":hashlib.sha256(path.read_bytes()).hexdigest(),"caption":caption}


def add(brand, family, rows, meta, region="Italy"):
    for model, outdoor, cool, heat, width, height, depth, size in rows:
        identifier = brand.lower().replace(' ', '-') + '-' + model.lower().replace('/', '-')
        units.append({"id":identifier,"manufacturer":brand,"family":family,"model":model,"sizeClass":str(size),
                      "nominalCoolingW":cool,"nominalHeatingW":heat,"widthMm":width,"heightMm":height,"depthMm":depth,
                      "region":region,"notes":"Codici e condizioni della fonte conservati. Disponibilità e suffisso di revisione da verificare in fase d'ordine.","sourceMetadata":meta})
        if outdoor:
            combinations.append({"id":identifier+'-mono',"manufacturer":brand,"mode":"mono","outdoorModel":outdoor,
                                 "indoorProductIds":[identifier],"coolingCapacityW":cool,"heatingCapacityW":heat,
                                 "indoorCoolingW":[cool],"indoorHeatingW":[heat],"minIndoorUnits":1,"maxIndoorUnits":1,
                                 "maxConnectedCapacityW":None,"approved":True,"notes":"Abbinamento monosplit e capacità nominali pubblicati; nessuna combinazione multisplit dedotta.",
                                 "region":region,"secondarySourceMetadata":[],"sourceMetadata":meta})


def describe(brand, family, title, tier, features, gains, meta, image):
    series.append({"manufacturer":brand,"family":family,"title":title,"tier":tier,"features":features,"gains":gains,
                   "sourceMetadata":meta,"productPhoto":image})


DAIKIN = "catalog-data/sources/hvac"
dpdf = DAIKIN + "/daikin-residential-2025.pdf"
spec = lambda p: source(DAIKIN,"daikin-residential-2025","Daikin",p,"Catalogo residenziale 2025")
for family, page, prefix, outside, heights, widths, depths, sizes, cool, heat in [
    ("Stylish",47,"FTXA","RXA",[295]*5,[798]*5,[189]*5,[20,25,35,42,50],[2000,2500,3400,4200,5000],[2500,2800,4000,5400,5800]),
    ("Emura",49,"FTXJ","RXJ",[305]*5,[900]*5,[212]*5,[20,25,35,42,50],[2000,2500,3400,4200,5000],[2500,2800,4000,5400,5800]),
    ("Comfora",54,"FTXP","RXP",[286]*3+[295]*3,[770]*3+[990]*3,[225]*3+[263]*3,[20,25,35,50,60,71],[2000,2500,3500,5000,6000,7100],[2500,3000,4000,6000,7000,8200]),
    ("Sensira",55,"FTXF","RXF",[286]*4+[295]*3,[770]*4+[990]*3,[225]*4+[263]*3,[20,25,35,42,50,60,71],[2000,2500,3300,4200,5000,6000,7100],[2400,2800,3500,4600,6000,6400,8200]),
]:
    text = PdfReader(ROOT / dpdf).pages[page-1].extract_text()
    capacity_rows = [line for line in text.splitlines() if line.startswith("Capacità di raffrescamento Min.") or line.startswith("Capacità di riscaldamento Min.")]
    for line, expected in zip(capacity_rows, [cool, heat], strict=True):
        nominal = [round(float(v.replace(",", "."))*1000) for v in re.findall(r"[\d.,]+/([\d.,]+)/[\d.,]+", line)]
        if nominal != expected:
            raise ValueError(f"Capacity source mismatch: {family}")
    rows=[]
    for i,size in enumerate(sizes):
        suffix = "CW" if family=="Stylish" else "AW" if family=="Emura" else "N9" if family=="Comfora" and size<=50 else "N" if family=="Comfora" else "E" if size<=42 else "D"
        external_suffix = "A9" if family=="Emura" else "A9" if family=="Stylish" and size<=35 else "B9" if family=="Stylish" and size==42 else "B8" if family=="Stylish" else "N8" if family=="Comfora" and size==50 else "N9" if family=="Comfora" else "E" if size<=42 else "D9" if size>=60 else "D"
        rows.append((f"{prefix}{size}{suffix}",f"{outside}{size}{external_suffix}",cool[i],heat[i],widths[i],heights[i],depths[i],size))
    add("Daikin",family,rows,spec(page))

for family,title,tier,features,gains,page,image_page,image_name in [
    ("Sensira","Sensira",1,["Pompa di calore R32","Wi-Fi predisposto, modulo opzionale","Timer e telecomando"],[],55,55,"Im0.jpg"),
    ("Comfora","Comfora",2,["Wi-Fi incluso/integrato secondo revisione","Filtro deodorizzante all'apatite di titanio","Modalità Comfort"],["Rispetto a Sensira: controllo Wi-Fi incluso/integrato e filtro deodorizzante all'apatite di titanio."],54,54,None),
    ("Perfera All Seasons","Perfera All Seasons",3,["Flash Streamer","Sensore di movimento a due aree","Wi-Fi integrato","Funzione Heat Boost"],["Rispetto a Comfora: Flash Streamer, sensore a due aree e Heat Boost."],51,51,"Im2.png"),
    ("Stylish","Stylish",4,["Flash Streamer","Intelligent Thermal Sensor","Wi-Fi integrato","Profondità 189 mm","Tre colori"],["Rispetto a Perfera: corpo di design più compatto e Intelligent Thermal Sensor; condizioni e prestazioni restano specifiche del modello."],47,47,"Im0.jpg"),
    ("Emura","Daikin Emura",5,["Flash Streamer","Intelligent Thermal Sensor e sensore a tre aree","Wi-Fi integrato","Design curvo in tre colori","Telecomando ARC488A1"],["Rispetto a Stylish: design curvo Emura, sensore a tre aree e telecomando dedicato; non viene dichiarato un aumento universale di potenza."],49,49,"Im2.jp2"),
]:
    if image_name is None:
        candidates=[im for im in PdfReader(ROOT/dpdf).pages[image_page-1].images if im.image.width>80 and im.image.width/im.image.height>1.4]
        if not candidates: raise ValueError("Comfora product photo missing")
        image_name=max(candidates,key=lambda im:im.image.width).name
    describe("Daikin",family,title,tier,features,gains,spec(page),photo("daikin-"+family.lower().replace(' ','-'),dpdf,image_page,image_name,spec(page),f"{title}, immagine originale Daikin della serie"))

SPLITS = "catalog-data/sources/splits"
gree_pdf = pdfplumber.open(ROOT/SPLITS/"gree-residential-2026.pdf")
for family,page,tier,features,gains,image in [
    ("Clivia",24,2,["Tecnologia G-AI","Lampada UV-C","I-Feel Plus","Wi-Fi con Bluetooth","Sette velocità"],["Rispetto a Pular: tecnologia G-AI e lampada UV-C integrata. I-Feel Plus e sette velocità sono già presenti anche sulla gamma Pular documentata."],"Im0.png"),
    ("Airy",14,3,["Tecnologia G-AI 2.0","Controllo umidità intelligente","Lancio dichiarato fino a 15,5 m","Ampia oscillazione flap","Wi-Fi con Bluetooth"],["Rispetto a Clivia: G-AI 2.0, controllo umidità intelligente e diffusione con lancio dichiarato fino a 15,5 m."],"Im1.png"),
]:
    text=gree_pdf.pages[page-1].extract_text();lines=text.splitlines()
    indoors=re.findall(r"GWH[A-Z0-9()-]+/I",next(l for l in lines if l.startswith("Modello unità interna")))
    outdoors=re.findall(r"GWH[A-Z0-9()-]+/O",next(l for l in lines if l.startswith("Modello unità esterna")))
    capacities=re.findall(r"(\d+[.,]\d+)\s*\(",next(l for l in lines if l.startswith("kW ") and '(' in l))
    dimensions=re.findall(r"(\d+)/(\d+)/(\d+)",next(l for l in lines if l.startswith("Dimensioni nette U.I.")))
    if len(indoors)!=4 or len(outdoors)!=4 or len(capacities)!=8 or len(dimensions)!=4:raise ValueError("Ambiguous Gree table")
    meta=source(SPLITS,"gree-residential-2026","Gree",page,"Catalogo residenziale Gree 2026")
    add("Gree",family,[(m,outdoors[i],float(capacities[2*i].replace(',','.'))*1000,float(capacities[2*i+1].replace(',','.'))*1000,
                       int(dimensions[i][1]),int(dimensions[i][0]),int(dimensions[i][2]),[9,12,18,24][i]) for i,m in enumerate(indoors)],meta)
    describe("Gree",family,"Airy Silver" if family=="Airy" else family,tier,features,gains,meta,photo("gree-"+family.lower(),SPLITS+"/gree-residential-2026.pdf",page,image,meta,f"Gree {family}, immagine originale della serie"))
meta=source(SPLITS,"gree-residential-2026","Gree",32,"Catalogo residenziale Gree 2026")
for family in ["Pular","Pular New"]:
    describe("Gree",family,family,1,["Pompa di calore R32","I-Feel Plus","Wi-Fi con Bluetooth","X-Fan","Sette velocità"],[],meta,
             photo("gree-pular",SPLITS+"/gree-residential-2026.pdf",32,"Im1.png",meta,"Gree Pular, immagine originale della famiglia"))

mitsubishi_pdf = pdfplumber.open(ROOT/SPLITS/"mitsubishi-uk-residential-2025.pdf")
for family,title,page,feature_page,tier,features,gains,image in [
    ("MSZ-HR","Classic / MSZ-HR",55,54,1,["Pompa di calore R32","Wi-Fi opzionale","Timer giornaliero"],[],"Im1.jpg"),
    ("MSZ-EF","Kirigamine Zen / MSZ-EF",51,50,3,["Design Zen in tre colori","MELCloud Wi-Fi integrato","Filtro V-Blocking","Plasma Quad Connect opzionale"],["Rispetto a Linea Plus: scelta di design Zen e tre colori. AY VGKP include Plasma Quad Plus; EF propone V-Blocking e Plasma Quad Connect opzionale. Il posizionamento di design non indica filtrazione superiore."],"Im5.jpg"),
    ("MSZ-LN","Kirigamine Style / MSZ-LN",49,48,4,["Plasma Quad integrato","Sensore 3D i-see","Dual Barrier Coating","Quattro colori","Wi-Fi integrato"],["Rispetto a Kirigamine Zen: Plasma Quad integrato, sensore 3D i-see e quattro finiture."],"Im7.jpg"),
]:
    lines=mitsubishi_pdf.pages[page-1].extract_text().splitlines()
    indoors=re.findall(r"MSZ-[A-Z]+\d+[A-Z0-9]+",next(l for l in lines if '- INDOOR UNITS' in l))
    heat=re.findall(r"(\d+[.]\d+)\s*\(",next(l for l in lines if 'Heating (nominal)' in l and 'CAPACITY' in l))
    cool=re.findall(r"(\d+[.]\d+)\s*\(",next(l for l in lines if l.startswith('Cooling (nominal)')))
    dims=re.findall(r"(\d+) x (\d+) x (\d+)",next(l for l in lines if l.startswith('DIMENSIONS (mm) Width')))
    external_line=next(l for l in lines if '- OUTDOOR UNITS' in l)
    outdoors=re.findall(r"MUZ-[A-Z]+\d+[A-Z0-9]+",external_line)
    missing=external_line.count('MULTI-SPLIT ONLY')
    if len(indoors)!=len(cool) or len(indoors)!=len(heat) or len(dims)!=len(cool) or len(outdoors)+missing!=len(indoors):raise ValueError("Ambiguous Mitsubishi table")
    rows=[]
    for i,m in enumerate(indoors):
        model=m+'W' if family!='MSZ-HR' else m
        rows.append((model,None if i<missing else outdoors[i-missing],float(cool[i])*1000,float(heat[i])*1000,
                     int(dims[i][0]),int(dims[i][2]),int(dims[i][1]),re.search(r'(\d+)',m)[1]))
    meta=source(SPLITS,"mitsubishi-uk-residential-2025","Mitsubishi Electric",page,"Residential product guide 2025 UK")
    add("Mitsubishi Electric",family,rows,meta,"UK; disponibilità Italia da verificare")
    fm=source(SPLITS,"mitsubishi-uk-residential-2025","Mitsubishi Electric",feature_page,"Residential product guide 2025 UK")
    describe("Mitsubishi Electric",family,title,tier,features,gains,fm,photo("mitsubishi-"+family.lower(),SPLITS+"/mitsubishi-uk-residential-2025.pdf",feature_page,image,fm,title+", immagine originale del produttore"))
meta=source(SPLITS,"mitsubishi-ay-2025","Mitsubishi Electric",2,"Brochure MSZ-AY 2025 Italia")
describe("Mitsubishi Electric","MSZ-AY","Linea Plus / MSZ-AY",2,["Plasma Quad Plus (VGKP)","Wi-Fi integrato","Self Clean Mode","Dual Barrier Coating","Timer settimanale"],
         ["Rispetto a Classic: Plasma Quad Plus nella versione VGKP, Wi-Fi integrato, Self Clean e timer settimanale."],meta,
         photo("mitsubishi-msz-ay",SPLITS+"/mitsubishi-ay-2025.pdf",2,"Im0.jp2",meta,"MSZ-AY, immagine originale della brochure italiana"))

(ROOT/"catalog-data/curation/split-series-extra.json").write_text(json.dumps({"indoorUnits":units,"combinations":combinations},ensure_ascii=False,indent=2)+"\n",encoding="utf8")
(ROOT/"catalog-data/generated/split-series-presentation.json").write_text(json.dumps(series,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
print(json.dumps({"additionalUnits":len(units),"additionalMonoCombinations":len(combinations),"presentedSeries":len(series)}))
