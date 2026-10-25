"""Normalize published VMC terminal tables; keep unknown geometry/noise explicit."""
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/"catalog-data/sources/ecoclima"
records=json.loads((SOURCE/"complete-html-tables.json").read_text(encoding="utf8"))
now=datetime.now(timezone.utc).isoformat()
families=[]

def number(value):
    value=value.strip().replace(",",".")
    return float(value) if re.fullmatch(r"-?\d+(?:\.\d+)?",value) else None

def point(q,pa=None,noise=None,velocity=None,throw=None,use=None,setting=None):
    p={"airflowM3h":q,"airflowPerMeterM3h":None,"velocityMs":velocity,"pressureDropPa":pa,"throwM":throw,"noiseDbA":None,"noiseUpperBoundDbA":None,"noiseLabel":noise or "n/d","referenceLengthM":None,"quality":"valid","qualityNote":None}
    if noise:
        if number(noise) is not None: p["noiseDbA"]=number(noise)
        elif noise.startswith("<") and number(noise[1:]) is not None: p["noiseUpperBoundDbA"]=number(noise[1:])
        elif re.fullmatch(r"\d+/\d+",noise): p["noiseUpperBoundDbA"]=max(map(float,noise.split("/")))
    if use:p["use"]=use
    if setting:p["settingCode"]=setting
    return p

def variant(code,suffix,model=None):
    return {"id":"ecoclima-"+code.lower()+"-"+re.sub(r"[^a-z0-9]+","-",str(suffix).lower()).strip("-"),"modelCode":model or code+" "+str(suffix),"widthMm":None,"heightMm":None,"depthMm":None,"lengthMm":None,"slotWidthMm":None,"slotCount":None,"commercialLengthsMm":[],"effectiveAreaM2":None,"faceWidthMm":None,"faceHeightMm":None,"bodyDepthMm":None,"operatingPoints":[]}

def family(record,code,variants,type="grille",shape="rectangle",use=None):
    source=record["htmlSource"]
    return {"manufacturer":"Ecoclima","familyCode":code,"name":record["name"],"description":"Dati originali Ecoclima. Configurazioni, dimensioni e prestazioni conservate solo quando pubblicate nelle tabelle; quote non disponibili esplicitamente nulle.","type":type,"mountingType":"Parete o soffitto; verificare installazione nella scheda originale","use":use or ["supply","return"],"isLinearPerMeter":False,"image":next((i["path"] for i in record["images"]),None),"operatingConditions":"Punti originali senza interpolazione. Rumore n/d escluso dalla selezione automatica. Ogni configurazione e direzione mantiene i propri valori.","variants":variants,"sourceMetadata":{"manufacturer":"Ecoclima","sourceUrl":source["sourceUrl"],"sourceType":"html","documentRevision":None,"retrievedAt":source["retrievedAt"],"importedAt":now,"sha256":source["sha256"],"page":None},"shape":shape,"modelCodes":list(dict.fromkeys(v["modelCode"] for v in variants)),"selectionStatus":"verified" if all(v["operatingPoints"] and all(p["noiseDbA"] is not None or p["noiseUpperBoundDbA"] is not None for p in v["operatingPoints"]) for v in variants) else "partial" if any(v["operatingPoints"] for v in variants) else "dimensions-only","geometryNote":"Le lettere delle quote originali restano originalDimensionsMm. Diametro nominale e ingombro frontale non sono intercambiabili."}

edsc=next(r for r in records if r["code"]=="EDSC-C")
for code in ["EDSC-C","EDSC-CC","EDSC-Q"]:
    table=next(t["grid"] for t in edsc["tables"] if t["heading"]=="Dati di funzionamento "+code)
    noise=table[-1][3:]
    if noise != [str(n) for i in range(8) for n in [20,25,30]]: raise ValueError("EDSC acoustic column topology changed")
    variants=[]
    for offset in range(1,len(table)-1,4):
        rows=table[offset:offset+4]; nominal=int(rows[0][0].split()[-1]); v=variant(code,nominal,code+" "+str(nominal)); v["nominalDiameterMm"]=nominal; v["connectionDiameterMm"]=nominal
        for start,use in [(0,"supply"),(2,"return")]:
            qrow=rows[start][3:]; parow=rows[start+1][3:]
            if len(qrow)!=24 or len(parow)!=24:raise ValueError("Incomplete EDSC rows")
            for j,(q,pa,n) in enumerate(zip(qrow,parow,noise)):
                q=number(q);pa=number(pa)
                if q is None or pa is None:continue
                p=point(q,pa,n,use=use,setting=table[0][j+3])
                triplet=[number(x) for x in qrow[(j//3)*3:(j//3)*3+3]]
                if all(x is not None for x in triplet) and triplet!=sorted(triplet):
                    p["quality"]="review";p["qualityNote"]="Portata non crescente nelle tre colonne sonore originali. Dato conservato; verifica produttore richiesta."
                if j>=3 and number(qrow[j-3]) is not None and q>number(qrow[j-3]):
                    p["quality"]="review";p["qualityNote"]="Portata maggiore rispetto alla configurazione precedente, a pari potenza sonora e con serranda maggiormente chiusa. Dato originale conservato; verifica produttore richiesta."
                v["operatingPoints"].append(p)
        variants.append(v)
    f=family(edsc,code,variants,"diffuser","rectangle" if code=="EDSC-Q" else "circle"); f["mountings"]=["ceiling"]; f["mountingType"]="Controsoffitto in cartongesso"; f["finishes"]=["Gesso verniciabile"]; f["operatingConditions"]+=" D0 senza serranda; D1-D4 segmenti; D5-D7 quattro segmenti con chiusura aggiuntiva 25/50/75%."; families.append(f)

codes={"EGE","EGFC","EDLSV","EGA-ONE","EAGF","EAG","EAL","EAG-AL","EAG-INOX","EAMV-V","EVREA","EVVAIR","EVVBOR","EVALI","EMV-PFS","EMV-S","EMV-J","EMV-BVS","EMV-350"}
for record in records:
    code=record["code"]
    if code not in codes:continue
    tables=record["tables"]; variants=[]; shape="rectangle"; type="grille"
    if code=="EDLSV":
        dims=tables[0]["grid"]; data=tables[1]["grid"]
        for r in dims[1:]:
            length=int(r[0]);v=variant(code,length);v.update(lengthMm=length,widthMm=number(r[1]),slotWidthMm=30,slotCount=1,originalDimensionsMm=dict(zip(dims[0][1:6],map(number,r[1:6]))),commercialLengthsMm=[length],faceWidthMm=length,faceHeightMm=number(r[1]))
            k=next(i for i,r in enumerate(data) if r[0]==str(length)+" mm" and "h" in r[2]);v["effectiveAreaM2"]=number(data[k][1])
            v["operatingPoints"]=[point(number(q),number(data[6][j+3]),data[7][j+3],number(data[5][j+3]),number(data[k+1][j+3]),"supply") for j,q in enumerate(data[k][3:])];variants.append(v)
        type="linear"
    elif code=="EGE":
        for t in tables:
            g=t["grid"]; pa=next((r for r in g if "Carico" in r[0]),None);noise=next((r for r in g if "Rumoros" in r[0]),None)
            if not pa or not noise:continue
            for r in g:
                if not re.match(r"^EGE \d+",r[0]):continue
                v=variant(code,r[0].split()[-1],r[0]);cols=range(1,len(r),2) if len(r)==7 else range(1,len(r))
                for j in cols:
                    speed=re.search(r"([\d,]+)\s*m/s",g[1][j]);v["operatingPoints"].append(point(number(r[j]),number(pa[j]),noise[j],number(speed[1]) if speed else None,number(r[j+1]) if len(r)==7 else None))
                variants.append(v)
    elif code=="EGFC":
        for r in tables[0]["grid"][1:]:
            w,h,depth=map(int,re.findall(r"\d+",r[1])[:3]);v=variant(code,f"{w}x{h}",r[0]);v.update(widthMm=w,heightMm=h,depthMm=depth,faceWidthMm=w,faceHeightMm=h,bodyDepthMm=depth)
            range_row=next(row for row in tables[1]["grid"] if row[0]==r[0]);v["publishedAirflowRangeM3h"]=list(map(float,re.findall(r"\d+",range_row[1])));g=tables[2]["grid"];j=g[0].index(r[0]);v["operatingPoints"]=[point(number(row[0]),number(row[j])) for row in g[2:] if number(row[0]) and number(row[j]) is not None];variants.append(v)
    elif code=="EGA-ONE":
        g=tables[0]["grid"]
        for r in g[3:]:
            w,h=map(int,re.findall(r"\d+",r[2]));v=variant(code,r[0].lower(),r[0]);v.update(widthMm=w,heightMm=h,faceWidthMm=w,faceHeightMm=h);v["operatingPoints"]=[point(number(g[1][j]),number(r[j])) for j in range(4,len(r)) if number(r[j]) is not None];variants.append(v)
    elif code in {"EAGF","EAG","EAL"}:
        g=next(t["grid"] for t in tables if t["heading"]=="Listino Prezzi")
        for r in g[2:]:
            w,h=map(int,re.findall(r"\d+",r[1]));v=variant(code,f"{w}x{h}",r[0]);v.update(widthMm=w,heightMm=h,faceWidthMm=w,faceHeightMm=h);v["publishedAirflowRangeM3h"]=[0,number(r[2])]
            # The EAL first table says EAL-212, while dimensional row is EAL-1212: retain without joining that typo.
            for t in tables:
                tg=t["grid"]
                if tg[0][0]!="" or len(tg[0])!=3:continue
                if tg[0][1].replace(" ","-")==r[0]:v["operatingPoints"]=[point(number(row[0]),number(row[1])) for row in tg[2:] if number(row[0]) and number(row[1]) is not None]
            variants.append(v)
    elif code=="EVREA":
        type="diffuser";g=tables[0]["grid"];op=next(t["grid"] for t in tables if t["heading"]=="Caratteristiche Tecniche")
        for r in g[1:]:
            n=int(r[0].split("-")[-1]);v=variant(code,n,r[0]);v.update(nominalDiameterMm=n,connectionDiameterMm=number(r[1]),faceWidthMm=number(r[2]),faceHeightMm=number(r[2]),originalDimensionsMm=dict(zip(["D","A","B","C"],map(number,r[1:]))))
            for row in op[2:]:
                if row[0]!=r[0]:continue
                for j,use,setting in [(2,"supply","Senza deflettori"),(5,"supply","Con deflettori"),(8,"return","Ripresa")]:v["operatingPoints"].append(point(number(row[1]),number(row[j]),row[j+2],number(row[j+1]),use=use,setting=setting))
            variants.append(v)
    elif code=="EVVBOR":
        type="valve";shape="circle";g=tables[0]["grid"];op=next(t["grid"] for t in tables if t["heading"]=="Caratteristiche Tecniche")
        for r in g[1:]:
            n=int(r[0].split("-")[-1]);v=variant(code,n,r[0]);v.update(nominalDiameterMm=n,connectionDiameterMm=number(r[1]),faceWidthMm=number(r[2]),faceHeightMm=number(r[2]),originalDimensionsMm=dict(zip(["D1","D2","Hmin","Hmax"],map(number,r[1:]))))
            for row in op[5:]:
                if row[0]!=r[0]:continue
                for j in range(2,16,2):
                    setting=" / ".join(dict.fromkeys(op[k][j] for k in [1,2,3]));v["operatingPoints"].append(point(number(row[1]),number(row[j]),row[j+1],use="supply" if j<10 else "return",setting=setting))
            variants.append(v)
    elif code=="EVVAIR":
        type="valve"
        for model in ["EVVAIR-C","EVVAIR-Q"]:
            v=variant(model,125,model+" 125");v["nominalDiameterMm"]=125;v["connectionDiameterMm"]=125
            for t in tables[:2]:
                use="supply" if "Mandata" in t["heading"] else "return";g=t["grid"]
                for r in g[2:]:
                    for j in range(2,11):v["operatingPoints"].append(point(number(r[0]),number(r[j]),velocity=number(r[1]),use=use,setting=g[1][j]))
            f=family(record,model,[v],type,"circle" if model.endswith("C") else "rectangle");families.append(f)
        continue
    elif code=="EVALI":
        type="valve";shape="circle";g=next(t["grid"] for t in tables if t["heading"]=="Listino Prezzi")
        for r in g[1:]:
            flow=int(r[0].split()[-1]);v=variant(code,flow,r[0]);v["publishedAirflowRangeM3h"]=[flow,flow];v["dimensionNote"]="Codice indica portata nominale, non diametro. Quote dimensionali non tabulate.";variants.append(v)
    elif code=="EAMV-V":
        for r in tables[0]["grid"][1:]:
            v=variant(code,r[0],r[0]);v.update(nominalDiameterMm=number(r[6]),connectionDiameterMm=number(r[6]),faceWidthMm=number(r[1]),faceHeightMm=number(r[1]),effectiveAreaM2=number(r[7]),originalDimensionsMm=dict(zip(["B","H","L","L1","L2","D"],map(number,r[1:7]))),publishedAirflowRangeM3h=[0,number(r[8])]);variants.append(v)
    else:
        g=tables[0]["grid"];shape="circle" if code in {"EAG-AL","EAG-INOX","EMV-PFS","EMV-BVS"} else "rectangle"
        if code=="EMV-PFS":type="diffuser"
        by_model={}
        for r in g[1:]:
            if not r[0].startswith((code,"EMV ","EMV-")):continue
            if code=="EAG-INOX":
                v=by_model.setdefault(r[0],variant(code,r[0].split("-")[-1],r[0]));v.update(nominalDiameterMm=number(r[1]),connectionDiameterMm=number(r[2]),faceWidthMm=number(r[3]),faceHeightMm=number(r[3]),bodyDepthMm=number(r[4]),effectiveAreaM2=number(r[5]));v["operatingPoints"].append(point(number(r[6]),number(r[7])));continue
            v=variant(code,r[0],r[0])
            if code=="EAG-AL":v.update(nominalDiameterMm=number(r[1]),connectionDiameterMm=number(r[1]),faceWidthMm=number(r[2]),faceHeightMm=number(r[2]),effectiveAreaM2=number(r[5]),originalDimensionsMm=dict(zip(["d","A","B","C"],map(number,r[1:5]))))
            elif code=="EMV-PFS":v.update(nominalDiameterMm=number(r[2]),connectionDiameterMm=number(r[2]),faceWidthMm=number(r[1]),faceHeightMm=number(r[1]),bodyDepthMm=number(r[3]),effectiveAreaM2=number(r[4]))
            elif code=="EMV-BVS":v.update(nominalDiameterMm=number(r[3]),connectionDiameterMm=number(r[3]),faceWidthMm=number(r[1]),faceHeightMm=number(r[1]),originalDimensionsMm={"interasseFori":number(r[2])})
            elif code in {"EMV-S","EMV-J"}:v.update(faceWidthMm=number(r[1]),faceHeightMm=number(r[2]),bodyDepthMm=number(r[3]),effectiveAreaM2=number(r[4]),originalDimensionsMm={"B":number(r[1]),"H":number(r[2]),"L":number(r[3])})
            elif code=="EMV-350":
                w,h=map(number,re.findall(r"[\d,]+",r[1]));v.update(widthMm=w,heightMm=h,faceWidthMm=w,faceHeightMm=h)
            variants.append(v)
        variants.extend(by_model.values())
    if not variants:raise ValueError("No original models normalized: "+code)
    f=family(record,code,variants,type,shape)
    if code=="EDLSV":f["modelCodes"]=["EDLSV","EDLSVB"];f["mountings"]=["ceiling"];f["finishes"]=["RAL9005","RAL9016"];f["operatingConditions"]="Dati per lunghezza discreta di 500 o 800 mm: non riscalati per metro. Vt 0,25 m/s, lancio laterale e deflettori al 50%. Ripresa non stimata."
    families.append(f)

for f in families:
    if any(p["quality"]=="review" for v in f["variants"] for p in v["operatingPoints"]): f["selectionStatus"]="partial"
(SOURCE/"normalized-vmc.json").write_text(json.dumps({"families":families},indent=2,ensure_ascii=False),encoding="utf8")
print(json.dumps({"families":len(families),"variants":sum(len(f["variants"]) for f in families),"points":sum(len(v["operatingPoints"]) for f in families for v in f["variants"])}))
