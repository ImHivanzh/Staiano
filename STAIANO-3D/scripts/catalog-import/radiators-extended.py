"""Import additional radiator families from acquired publisher text snapshots.

Developer tool only; acquisition is separate. --apply writes current catalogs and
appends immutable snapshots to radiator-history.json. Legacy catalogs untouched.
"""
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCES = ROOT / "catalog-data/sources"
OUTPUT = ROOT / "catalog-data/generated"
MANIFEST = {v["name"]: v for v in json.loads((SOURCES / "radiators-extended-manifest.json").read_text(encoding="utf8"))}
for source in MANIFEST.values():
    document = SOURCES / (source["name"] + ".pdf")
    if hashlib.sha256(document.read_bytes()).hexdigest() != source["sha256"]:
        raise ValueError(f"Source checksum mismatch: {document.name}")
NOW = datetime.now(timezone.utc).isoformat()
products = []

def pages(name):
    return json.loads((SOURCES / (name + ".pages.json")).read_text(encoding="utf8"))

def numbers(text):
    return [float(v.replace(",", ".")) for v in re.findall(r"\d+(?:[,.]\d+)?", text)]

def base(name, family, page):
    source = MANIFEST[name]
    manufacturer = "Cordivari" if name.startswith("cordivari") else "Zehnder" if name.startswith("zehnder") else "Lazzarini"
    return dict(id="", manufacturer=manufacturer, family=family, model="", code=None,
                construction="fixed", visualShape="towel", productPhoto=source["productPhoto"],
                exponentMethod="manufacturer", geometryAccuracy="published", columns=None,
                heightMm=1, interaxisMm=1, depthMm=1, pitchMm=1, widthAdditionMm=0,
                widthNote="Prodotto completo a dimensioni fisse. Resa, peso e acqua riferiti all'intero radiatore. Interasse orizzontale; valvole escluse.",
                commercialElementCounts=[1], elementOutputW=1, referenceDeltaTK=50,
                elementOutput30W=None, exponentN=None, coefficientKm=None,
                waterContentL=None, weightKg=None, nominalFlowKgh=None,
                maxPressureBar=None, maxTemperatureC=None, connections=None,
                sourceMetadata=dict(manufacturer=manufacturer, sourceUrl=source["sourceUrl"],
                                    sourceType="pdf", documentRevision=source["documentRevision"],
                                    retrievedAt=source["retrievedAt"], importedAt=NOW,
                                    sha256=source["sha256"], page=page))

for name, family, heights, per_height in [
        ("cordivari-lisa22", "Lisa 22", [700,1160,1385,1732], 6),
        ("cordivari-claudia", "Claudia", [763,1195,1411,1807], 7)]:
    text = pages(name)[1]
    marker = "LISA® 22 R01-RAL 9010" if name.endswith("lisa22") else "CLAUDIA®"
    segment = re.split(r"Per ΔT|I codici", text.split(marker,1)[1])[0]
    rows = [line for line in segment.splitlines() if re.search(r"355\d{10}",line)]
    assert len(rows) == len(heights)*per_height, (name,len(rows))
    for i,line in enumerate(rows):
        codes = re.findall(r"355\d{10}",line)
        dims = numbers(line[:line.index(codes[0])])[-2:]
        data = numbers(line[line.index(codes[1])+len(codes[1]):])
        weight,_,water,q50,q30,n = data[:6]
        height = heights[i//per_height]
        item = base(name,family,2)
        item.update(id=f"{name}-{codes[0]}", model=f"{family} {height}×{int(dims[0])} bianco R01",
                    code=codes[0], heightMm=height,pitchMm=dims[0],interaxisMm=dims[1],depthMm=45,
                    weightKg=weight,waterContentL=water,elementOutputW=q50,elementOutput30W=q30,
                    exponentN=n,maxPressureBar=8,maxTemperatureC=110,connections='3 × 1/2" G')
        products.append(item)

name="cordivari-tamara"
source_pages=pages(name)
text=source_pages[0]
# Numeric arrays immediately above/beside the published labels. These exact
# values are checked against the source text before use; no interpolation.
heights=[600,800,1000,1200,1400,1600,1800,1900,2000]
q50=[45.1,58.4,71.5,84.6,97.7,110.9,124.2,130.9,137.6]
q30=[24.0,30.8,37.4,44.2,51.0,57.9,64.8,68.3,71.7]
weight=[.827,1.049,1.271,1.492,1.714,1.935,2.157,2.270,2.379]
water=[.608,.805,1.001,1.198,1.394,1.590,1.787,1.885,1.983]
exponents=[1.2372,1.2536,1.2701,1.2711,1.272,1.273,1.2739,1.2734,1.2748]
numeric_rows=[numbers(line) for line in text.splitlines()]
for values in [heights,q50,q30,weight,water,exponents]:
    assert any(row[-9:]==values for row in numeric_rows),(name,values)
counts=[]
for line in source_pages[1].splitlines():
    match=re.fullmatch(r"(\d+) (\d+) (?:\d+ ){8}\d+",line)
    if match and int(match[1])==int(match[2])*60: counts.append(int(match[2]))
assert counts==list(range(5,31)),counts
for i,height in enumerate(heights):
    item=base(name,"Tamara verticale",1)
    item.update(id=f"cordivari-tamara-verticale-{height}",model=f"Tamara verticale H{height}",
                construction="sectional",visualShape="panel",heightMm=height,interaxisMm=height-34,
                depthMm=30,pitchMm=60,commercialElementCounts=counts,elementOutputW=q50[i],
                elementOutput30W=q30[i],exponentN=exponents[i],waterContentL=water[i],weightKg=weight[i],
                maxPressureBar=5,maxTemperatureC=110,connections='2 × 1/2" G + 1 × 1/8" G',
                widthNote="L = elementi × 60 mm. Assemblaggio di fabbrica da 5 a 30 elementi. Interasse verticale H−34 per V03/V04; valvole escluse. Scheda p.1–2.")
    products.append(item)

name="zehnder-charleston"
source_pages=pages(name)
for columns,page in zip(range(2,7),[6,12,18,24,28]):
    rows=[line for line in source_pages[page-1].splitlines() if re.match(fr"^{columns}\d{{3}} ",line)]
    assert len(rows)>=27,(columns,len(rows))
    for line in rows:
        data=numbers(line)
        assert len(data)==12,line
        code,height,interaxis,depth,water,weight,_,flow,n,q50,q30,_=data
        limits=[64,64,64,64,22,22,22] if columns<=3 else [64,64,64,60,22,22,22] if columns==4 else [64,64,50,50,22,22,17] if columns==5 else [64,55,46,42,22,17,14]
        band=next(i for i,limit in enumerate([600,750,900,1000,2000,2500,3000]) if height<=limit)
        item=base(name,f"Charleston {columns} colonne",page)
        item.update(id=f"zehnder-charleston-{int(code)}",model=f"Charleston {int(code)}",code=str(int(code)),
                    columns=columns,construction="sectional",visualShape="tubular",heightMm=height,
                    interaxisMm=interaxis,depthMm=depth,pitchMm=46,widthAdditionMm=21 if columns==2 else 26,
                    commercialElementCounts=list(range(3,limits[band]+1)),waterContentL=water,weightKg=weight,
                    nominalFlowKgh=flow,exponentN=n,elementOutputW=q50,elementOutput30W=q30,
                    maxPressureBar=10,maxTemperatureC=110,connections='1"' if columns==2 else '1 1/4"',
                    widthNote=f"L = elementi × 46 mm; ingombro con tappi +{21 if columns==2 else 26} mm dal disegno p.{page}. Valvole escluse. Altezza esatta della tabella tecnica; min.3 elementi, massimi batteria p.5.")
        products.append(item)

# Nova Easy vertical p.4–5: published tables visually checked. Hidden drawing
# text corrupts several extracted cells; preserve a curated exact table instead.
if MANIFEST["zehnder-nova"]["sha256"] != "b93e54a122aa671ce0da18892526e726ac6f16ec54229f4f0852ed33b8f707c8":
    raise ValueError("Nova source revision changed; visually recheck curated rows before importing")
nova={
 "ZNV": (4,47,[1.28,1.28],[[625,325,5.8,15.4],[750,390,6.9,18.4],[875,455,8.1,21.5],[1000,520,9.2,24.6],[690,359,6.3,16.9],[828,431,7.6,20.3],[966,502,8.8,23.7],[1104,574,10.1,27.0]]),
 "ZNVL": (4,60,[1.35,1.34],[[835,419,5.8,25.5],[1002,503,6.9,30.5],[1169,587,8.1,35.6],[1336,670,9.2,40.7],[900,454,6.3,27.3],[1080,545,7.6,32.7],[1260,635,8.8,38.2],[1440,726,10.1,43.6]]),
 "ZNVV": (5,55,[1.34,1.33],[[905,456,10.8,29.4],[1086,548,12.9,35.3],[1267,639,15.1,41.2],[1448,730,17.2,47.0],[990,502,11.9,32.5],[1188,602,14.3,39.0],[1386,703,16.7,45.5],[1584,803,19.0,52.0]]),
 "ZNVLV": (5,113,[1.36,1.35],[[1280,639,11.5,40.4],[1536,766,13.8,48.5],[1792,894,16.1,56.6],[2048,1022,18.4,64.6],[1380,692,12.6,43.8],[1656,831,15.1,52.5],[1932,969,17.6,61.3],[2208,1108,20.2,70.0]])}
for series,(page,depth,exponents,rows) in nova.items():
    for i,(q50,q30,water,weight) in enumerate(rows):
        height=1800 if i<4 else 2000
        elements=i%4+5
        width=[361,432,504,575][i%4]
        code=f"{series}-{height//10}-00{elements}-3570-9016"
        item=base("zehnder-nova",f"Nova Easy verticale {series}",page)
        item.update(id="zehnder-nova-"+code.lower(),model=f"Nova Easy {series} {height}×{width}",
                    code=code,heightMm=height,pitchMm=width,interaxisMm=[312,383,455,526][i%4],
                    depthMm=110 if series=="ZNVLV" and i==6 else depth,visualShape="panel",
                    elementOutputW=q50,elementOutput30W=q30,waterContentL=water,weightKg=weight,
                    exponentN=exponents[0 if i<4 else 1],maxPressureBar=4.5,maxTemperatureC=110,
                    connections='3570; sfiato 1/4"',widthNote=f"Prodotto completo saldato di fabbrica: {elements} tubi verticali. Quote e rese dell'intero radiatore da p.{page}; interasse orizzontale 3570. Nessuna estrapolazione di larghezze.")
        products.append(item)

sys.path.insert(0, str(Path(__file__).resolve().parent))
from zehnder_series import import_series
zehnder_rejected = import_series(products, base, pages, SOURCES)
print("Zehnder series rows skipped (corrupt text layer or no match):", len(zehnder_rejected), zehnder_rejected)

for name in ["lazzarini-sanremo","lazzarini-garda","lazzarini-empoli"]:
    finish="bianco"
    count=0
    for page,text in enumerate(pages(name),1):
        for line in text.splitlines():
            for label,color in [("White","bianco"),("Chrome","cromato"),("Anthracite","antracite"),("Matt Black","nero")]:
                if line.startswith(label): finish=color
            if not re.match(r"^\d{6} ",line): continue
            tokens=line.split()
            code=tokens.pop(0)
            sanremo=name.endswith("sanremo")
            empoli=name.endswith("empoli")
            if sanremo and finish!="antracite": tokens.pop(0) # alternate curved code; straight family only
            data=[float(token.replace(",",".")) for token in tokens]
            assert len(data)==(11 if sanremo or empoli else 10),line
            height,width,interaxis=data[:3]
            offset=1 if empoli else 0
            weight,water,q50,q30=data[3+offset:7+offset]
            family=f"Sanremo {finish} dritto" if sanremo else f"Empoli {finish}" if empoli else f"Garda {finish}"
            item=base(name,family,page)
            item.update(id=f"{name}-{code}",model=f"{family} {int(height)}×{int(width)}",code=code,
                        heightMm=height,pitchMm=width,interaxisMm=interaxis,depthMm=40 if sanremo else 47.5 if empoli else 35,
                        geometryAccuracy="schematic" if sanremo or empoli else "published",
                        geometryNote="Involucro schematico: profondità dal profilo collettore 40×30 mm; quote installate nel disegno p.2." if sanremo else "Profondità dal disegno: fronte 85 − asse 55 + raggio collettore 17,5 = 47,5 mm; specchio centrale integrato." if empoli else "Profondità corpo dal collettore Ø35 mm e disegno p.2; versione reversibile.",
                        weightKg=weight,waterContentL=water,elementOutputW=q50,elementOutput30W=q30,exponentN=data[-1],
                        visualShape="decorative" if empoli else "towel",maxPressureBar=4 if empoli else 10,maxTemperatureC=90,
                        connections='6 × 1/2"; centrale 50 mm disponibile' if empoli else '3 × 1/2"' if sanremo else '4 × 1/2"; interasse 50 mm',
                        widthNote=f"Prodotto completo a dimensioni fisse. Interasse orizzontale; valvole escluse. Resa specifica finitura {finish}; non trasferire resa bianca alla finitura cromata.")
            products.append(item)
            count+=1
    assert count>=(49 if name.endswith("sanremo") else 6),(name,count)

history_file=OUTPUT/"radiator-history.json"
history=json.loads(history_file.read_text(encoding="utf8"))
for filename,manufacturer in [("cordivari-comfort","Cordivari"),("zehnder","Zehnder"),("lazzarini","Lazzarini")]:
    selected=[v for v in products if v["manufacturer"]==manufacturer]
    stable=json.loads(json.dumps(selected))
    for item in stable:
        item["sourceMetadata"].pop("importedAt")
        item["sourceMetadata"].pop("retrievedAt")
    digest=hashlib.sha256(json.dumps(stable,sort_keys=True,ensure_ascii=False).encode()).hexdigest()[:12]
    catalog=dict(version=f"2026-10-04-{filename}-{digest}",manufacturer=manufacturer,products=selected)
    target=OUTPUT/(filename+".json")
    old=json.loads(target.read_text(encoding="utf8")) if target.exists() else None
    removed=[v["id"] for v in old["products"] if not any(p["id"]==v["id"] for p in selected)] if old else []
    if removed: raise ValueError(f"Removed models require explicit review: {removed}")
    report=dict(imported=len(selected),added=sum(not old or not any(p["id"]==v["id"] for p in old["products"]) for v in selected),removed=removed,families=list(dict.fromkeys(v["family"] for v in selected)),errors=0)
    (OUTPUT/(filename+".staging.json")).write_text(json.dumps(catalog,ensure_ascii=False,indent=2),encoding="utf8")
    (OUTPUT/(filename+".report.json")).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf8")
    if "--apply" in sys.argv:
        if old: history.setdefault(old["version"],old)
        final=old if old and old["version"]==catalog["version"] else catalog
        history.setdefault(final["version"],final)
        target.write_text(json.dumps(final,ensure_ascii=False,indent=2),encoding="utf8")
    print(filename,len(selected),"models;",len(report["families"]),"families")
if "--apply" in sys.argv:
    history_file.write_text(json.dumps(history,ensure_ascii=False,separators=(",", ":"))+"\n",encoding="utf8")
