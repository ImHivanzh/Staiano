"""Normalize archived official Ecoclima diffuser tables, without network or interpolation.

Unverified geometry stays null. Operating rows are joined only within original
HTML table coordinates. Separate configurations never inherit unverified points.
"""
import copy
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / "catalog-data/sources/ecoclima"
EXCLUDE = {"EDLS", "EDSC-C", "EVVMC", "EPSP", "ETIM"}
NOW = datetime.now(timezone.utc).isoformat()


def number(value):
    text = str(value).strip().replace("−", "-")
    if not re.fullmatch(r"-?\d+(?:[.,]\d+)?", text):
        return None
    return float(text.replace(",", "."))


def pair(value):
    m = re.fullmatch(r"\s*(\d+)\s*[x×]\s*(\d+)\s*", value, re.I)
    return tuple(map(int, m.groups())) if m else None


def slug(value):
    return re.sub(r"[^a-z0-9]+", "-", str(value).lower()).strip("-")


def noise(value):
    value = str(value).strip()
    n = number(value)
    upper = number(value[1:]) if value.startswith("<") else None
    interval = re.fullmatch(r"(\d+)\s*[-/]\s*(\d+)", value)
    if interval:
        upper = int(interval[2])
    return dict(noiseDbA=n, noiseUpperBoundDbA=upper,
                noiseLabel=value or "Non dichiarato")


def point(q, pressure=None, sound="", velocity=None, throw=None, linear=False, **extra):
    return dict(airflowM3h=q, airflowPerMeterM3h=q if linear else None,
                velocityMs=velocity, pressureDropPa=pressure, throwM=throw,
                referenceLengthM=1 if linear else None, quality="valid",
                qualityNote=None, **noise(sound), **extra)


def variant(code, key, width=None, height=None, face=None, diameter=None, depth=None, original=None):
    v = dict(id=f"ecoclima-{slug(code)}-{slug(key)}", widthMm=width,
             heightMm=height, depthMm=depth, lengthMm=None, slotWidthMm=None,
             slotCount=None, commercialLengthsMm=[], effectiveAreaM2=None,
             operatingPoints=[], faceWidthMm=face[0] if face else None,
             faceHeightMm=face[1] if face else None, bodyDepthMm=depth)
    if diameter: v["nominalDiameterMm"] = diameter
    if original: v["originalDimensionsMm"] = original
    return v


def metadata(source):
    return dict(manufacturer="Ecoclima", sourceUrl=source["sourceUrl"],
                sourceType="html" if source["filename"].endswith(".html") else "pdf",
                documentRevision=source["label"], retrievedAt=source["retrievedAt"],
                importedAt=NOW, sha256=source["sha256"], page=None)


def family(record, code=None, shape="rectangle", linear=False, use=None):
    code = code or record["code"]
    return dict(manufacturer="Ecoclima", familyCode=code,
                name=re.sub(r"\s+", " ", record["name"]).strip(),
                description="Dimensioni e prestazioni pubblicate dal produttore; campi non verificati lasciati null.",
                type="linear" if linear else "valve" if code.startswith(("EV", "EAM")) else "diffuser",
                mountingType="Soffitto" if code != "EDFDS" else "Pavimento",
                mountings=["ceiling"] if code != "EDFDS" else [], shape=shape,
                use=use or ["supply"], isLinearPerMeter=linear,
                image=record["images"][0]["path"] if record["images"] else None,
                operatingConditions="Dati originali tabellati. Accessori, configurazioni e condizioni non dichiarate richiedono verifica del documento ufficiale. Nessuna interpolazione o correzione acustica.",
                geometryNote="Quote originali del diffusore; dimensioni di plenum e accessori non usate come geometria del terminale.",
                variants=[], sourceMetadata=metadata(record["htmlSource"]))


def original(row, headers, start=0):
    result = {}
    for i in range(start, min(len(row), len(headers))):
        n = number(row[i])
        # Areas, masses and prices are not dimensions.
        if n is not None and not re.search(r"sezione|peso|kg|m²|m 2|€|ponti|stacchi|massima", headers[i], re.I):
            key = headers[i]
            if key in result: key += f" [{i}]"
            result[key] = n
    return result


def modelkey(label):
    label = label.strip()
    m = re.search(r"(\d+\s*[x×]\s*\d+|\d+(?:\s*/\s*\d+)?)$", label)
    return re.sub(r"\s+", "", m[0]).replace("×", "x") if m else label


def blocks(tables):
    """Return row-oriented performance blocks with verified same-column joins."""
    output = {}
    for table in tables:
        rows = table["grid"]
        # EDRC, filtered and multi-nozzle matrices have distinct explicit parsers.
        if not any("funzionamento" in table["heading"].lower() for _ in [0]): continue
        for r, row in enumerate(rows):
            labels = [i for i, cell in enumerate(row) if re.sub(r"\s+", "", cell).lower() in {"m³/h", "m3/h"}]
            for label in labels:
                if label == 0: continue
                model = modelkey(row[0])
                if not re.search(r"\d", model): continue
                start = label + 1
                # Repeated label cells (EDFDS) are original colspans.
                while start < len(row) and row[start] == row[label]: start += 1
                end = start
                while end < len(row) and number(row[end]) is not None: end += 1
                # Trailing deflector counts and recommended MIN/MAX do not represent operating columns.
                headers = max(rows[:2], key=lambda x: sum(number(c) is not None for c in x)) if any("Vk" in c for x in rows[:2] for c in x) else None
                if headers:
                    end = min(end, next((i for i in range(start,len(headers)) if number(headers[i]) is None), end))
                n = end - start
                if not n: continue
                relevant = [x for x in rows if modelkey(x[0]) == model]
                pressure = next((x for x in relevant if label < len(x) and x[label] == "Pa"), None)
                sound = next((x for x in relevant if label < len(x) and x[label] == "dB(A)"), None)
                throw = next((x for x in relevant if label < len(x) and x[label] in ["L(m)","Lo(m)"]), None)
                if pressure is None:
                    pressure = next((x for x in rows if label < len(x) and x[label] == "Pa" and not re.search(r"\d", x[0])), None)
                if sound is None:
                    sound = next((x for x in rows if label < len(x) and x[label] == "dB(A)" and not re.search(r"\d", x[0])), None)
                # Multiple pressure configurations (EDRF) cannot be flattened safely.
                if any(label < len(x) and x[label].startswith("Pa (") for x in relevant): pressure = None
                values = lambda x,i: number(x[i]) if x and i < len(x) else None
                area = number(row[1]) if label >= 2 else None
                ops = [point(number(row[i]), values(pressure,i), sound[i] if sound else "", values(headers,i), values(throw,i), use="supply") for i in range(start,end)]
                output[model] = dict(area=area, points=ops)
    return output


def attach(f, data, keys):
    for v,key in zip(f["variants"],keys):
        b = data.get(modelkey(str(key)))
        if b:
            if b["area"] and b["area"] > 0: v["effectiveAreaM2"] = b["area"]
            v["operatingPoints"] = copy.deepcopy(b["points"])


def linear_families(r):
    code=r["code"]; result=[]
    if code=="EDLH":
        f=family(r,linear=True,use=["supply","return"]); f["modelCodes"]=["EDLH","EDLHB"]
        f["mountings"]=["wall","ceiling"]; f["mountingType"]="Parete o soffitto in cartongesso"
        dims=[t for t in r["tables"] if "dimensioni diffusore" in t["heading"].lower()]
        perf=next(t["grid"] for t in r["tables"] if t["grid"][0][0]=="Feritoia")
        for s,t in enumerate(dims,1):
            for sw in [20,30]:
                rows=[row for row in t["grid"][1:] if f"da {sw} mm" in row[1]]
                v=variant(code,f"{s}f-{sw}",width=number(rows[0][3]),original=original(rows[0],t["grid"][0],3))
                v.update(slotCount=s,slotWidthMm=sw,faceHeightMm=number(rows[0][3]),commercialLengthsMm=[number(row[2]) for row in rows])
                flow=next(x for x in perf if x[0].startswith(str(s)) and f"{sw} mm" in x[1] and re.sub(r"\s+","",x[3]) in ["m³/h","m3/h"])
                launch=next(x for x in perf if x[0]==flow[0] and x[1]==flow[1] and x[3]=="L(m)")
                sound=next(x for x in perf if x[0]==flow[0] and x[3]=="dB(A)")
                velocity=next(x for x in perf if x[3]=="m/s"); pressure=next(x for x in perf if x[3]=="Pa")
                v["effectiveAreaM2"]=number(flow[2]); v["operatingPoints"]=[point(number(flow[i]),number(pressure[i]),sound[i],number(velocity[i]),number(launch[i]),True,use="supply") for i in range(4,10)]
                f["variants"].append(v)
        f["operatingConditions"]="Dati per 1 m, Vt 0,25 m/s, montaggio a filo soffitto, lancio laterale Coanda, senza serranda, deflettori al 50%. Tabella acustica condivisa per feritoie 20/30 mm. Ripresa e diversa lunghezza richiedono verifica."
        return [f]
    if code=="EDFLB-FL":
        f=family(r,linear=False,use=["return"]); f["type"]="linear"
        dims=next(t["grid"] for t in r["tables"] if t["grid"][0][0]=="Nr. Feritoie" and "A (mm)" in t["grid"][0])
        table=next(t["grid"] for t in r["tables"] if "funzionamento" in t["heading"].lower())
        for row in dims[1:]:
            slots=int(row[0])
            for c in range(2,len(table[0]),3):
                length=int(re.search(r"\d+",table[0][c])[0]); v=variant(code,f"{slots}f-{length}",width=length,height=number(row[2]),face=(length,number(row[2])),original=original(row,dims[0],1))
                v.update(slotCount=slots,lengthMm=length,commercialLengthsMm=[length])
                v["operatingPoints"]=[point(number(x[c]),number(x[c+1]),x[c+2],number(x[1]),use="return") for x in table[2:] if int(x[0])==slots]
                f["variants"].append(v)
        f["operatingConditions"]="Ripresa con filtro. Prestazioni originali specifiche per numero feritoie e lunghezza 800, 1000, 1500 o 2000 mm; nessuna conversione per metro."
        return [f]
    # Other linears: each configuration has an independent searchable family.
    dims=next(t["grid"] for t in r["tables"] if "dimensioni diffusore lineare" in t["heading"].lower())
    h=next(i for i,row in enumerate(dims) if row[0]=="Nr. Feritoie"); headers=dims[h]
    sizes={}
    for row in dims[h+1:]:
        if not re.match(r"\d+ Ferito",row[0]): continue
        slots=int(row[0].split()[0]); sizes.setdefault(slots,[]).append(row)
    # PDF specifies EDFL 5 and 6 slots absent from HTML dimensional table.
    if code=="EDFL":
        text=(DEST/r["documents"][0]["filename"]).with_suffix(".txt").read_text(encoding="utf8")
        if "5 feritoie" in text and "6 feritoie" in text:
            for slots,abc in [(5,[206,230,201]),(6,[246,270,241])]:
                sizes[slots]=[[f"{slots} Feritoia",str(L),*map(str,abc),"2"] for L in [600,800,1000,1200,1500,2000]]
    perf=next(t["grid"] for t in r["tables"] if len(t["grid"][0])>2 and "Sezione Efficace" in t["grid"][0][1])
    configs=[10,20,30,40,50] if code=="EDFL" else [10,20,40,50]
    for base in [code,"EDFLB" if code=="EDFL" else "EDFLBNA"]:
        for config in configs:
            if base=="EDFLB" and config in [10,30]: continue
            f=family(r,f"{base}-{config}",linear=True,use=["return"] if config in [10,30] else ["supply"])
            f["modelCodes"]=[f"{base}-{config}",f"{base} {config}"]
            for slots,rows in sizes.items():
                v=variant(f["familyCode"],f"{slots}f",width=number(rows[0][2]),original=original(rows[0],headers,2))
                v.update(slotCount=slots,faceHeightMm=number(rows[0][3]),commercialLengthsMm=sorted(set(number(x[1]) for x in rows)))
                fr=next((x for x in perf if x[0].startswith(str(slots)) and re.sub(r"\s+","",x[2]) in ["m³/h","m3/h"]),None)
                if fr and config in [20,40]:
                    pr=next((x for x in perf if x[0]==fr[0] and x[2]=="Pa"),None) or next((x for x in perf if x[2]=="Pa" and x[0]=="Perdite di Carico"),None)
                    nr=next(x for x in perf if x[2]=="dB(A)"); vr=next(x for x in perf if x[2]=="m/s"); tr=next((x for x in perf if x[0]==fr[0] and x[2] in ["L(m)","Lo(m)"]),None)
                    v["effectiveAreaM2"]=number(fr[1]); v["operatingPoints"]=[point(number(fr[i]),number(pr[i]) if pr else None,nr[i],number(vr[i]),number(tr[i]) if tr else None,True,use="supply") for i in range(3,len(fr))]
                f["variants"].append(v)
            f["operatingConditions"]="Dati di mandata per 1 m, deflettori al 50%, senza serranda o serranda aperta. Versioni di ripresa e con equalizzatore: prestazioni non trasferite dalla tabella di mandata. EDFLNA rumore pubblicato come intervallo, limite superiore conservato."
            result.append(f)
    return result


def normalize(r):
    code=r["code"]; tables=r["tables"]; data=blocks(tables)
    if code in ["EDLH","EDFL","EDFLB-FL","EDFLNA"]: return linear_families(r)
    f=family(r); keys=[]; result=[f]
    # Square swirl plates.
    if code in ["EDE1","EDE2","EDE2S","EDE5","EDE-FB","EDQMQ","EDQMC"]:
        table=next(t["grid"] for t in tables if "dimensioni diffusore" in t["heading"].lower() and len(t["grid"])>1)
        for row in table[1:]:
            key="600" if code=="EDE2S" else modelkey(row[1]); wh=pair(row[2]) or (number(row[2]),number(row[3]))
            if not all(wh): continue
            v=variant(code,key,width=wh[0],height=wh[1],face=wh,original=original(row,table[0],2)); f["variants"].append(v); keys.append(key)
        attach(f,data,keys)
        if code in ["EDE1","EDE2"]:
            # Circular versions have their own PDF geometry and PDF performance revision.
            text=(DEST/r["documents"][0]["filename"]).with_suffix(".txt").read_text(encoding="utf8")
            block=text.split("DIMENSIONI PANNELLO CIRCOLARE:")[1].split("PAG")[0]
            c=family(r,code+"R",shape="circle"); c["sourceMetadata"]=metadata(r["documents"][0])
            for nominal,actual in re.findall(r"^(\d+) (\d+)$",block,re.M):
                d=int(nominal); c["variants"].append(variant(c["familyCode"],d,width=int(actual),face=(int(actual),int(actual)),diameter=d))
            c["operatingConditions"]="Versione circolare documentata nel PDF. Revisione PDF diversa dai dati HTML del pannello quadrato: prestazioni non trasferite."
            result.append(c)
            # Smaller swirl insert on a 600 mm square panel, cataloged separately.
            for t in tables:
                if t["heading"]=="Listino Prezzi" and any("/600" in x for x in t["grid"][0]):
                    for key in t["grid"][0][1:]:
                        if "/600" not in key: continue
                        f["variants"].append(variant(code,key,width=None,height=None))
        return result
    if code in ["EDRA","EDCS","EDRC","EDRCS"]:
        table=tables[0]["grid"]; headers=table[1]
        thermal=code=="EDRCS"
        codes=["EDRCS THERM","EDRCS-PQR THERM"] if thermal else ["EDRC","EDRCS","EDRC-PQR","EDRCS-PQR"] if code=="EDRC" else [code,code+"-PQ"]
        result=[]
        for c in codes:
            panel="-PQ" in c; g=family(r,c,shape="rectangle" if panel else "circle"); keys=[]
            for row in table[2:]:
                nominal=number(row[0]);
                if not nominal: continue
                if code in ["EDRA","EDCS"]:
                    face=pair(row[9]) if panel else (number(row[2]),number(row[2])); depth=None
                else:
                    pcol=8 if code=="EDRC" else 7
                    face=pair(row[pcol]) if panel else (number(row[3]),number(row[3])); depth=number(row[11 if panel and code=="EDRC" else 9 if panel else 6 if code=="EDRC" else 5])
                if not face or not all(face): continue
                v=variant(c,int(nominal),width=face[0],height=face[1] if panel else None,face=face,diameter=nominal,depth=depth,original=original(row,headers,1)); g["variants"].append(v); keys.append(str(int(nominal)))
                if code in ["EDRC","EDRCS"]: v["effectiveAreaM2"]=number(row[1])
            if code in ["EDRA","EDCS"]: attach(g,data,keys)
            else: g["operatingConditions"]="Geometria variabile; tabelle separate per riscaldamento/raffrescamento, angolo pala e differenza di temperatura. Prestazioni in attesa di modello completo della configurazione."
            result.append(g)
        return result
    if code in ["EDRF","EDRFB"]:
        result=[]
        for idx,c in enumerate([code,"EDRFQ" if code=="EDRF" else "EDRFQB"]):
            table=tables[idx]["grid"]; panel=idx==1; g=family(r,c,shape="rectangle" if panel else "circle"); keys=[]
            for row in table[1:]:
                nominal=number(row[1]); wh=pair(row[3]) if panel else (number(row[3]),number(row[3]))
                if not nominal or not wh: continue
                v=variant(c,int(nominal),width=wh[0],height=wh[1] if panel else None,face=wh,diameter=nominal,depth=number(row[-1]),original=original(row,table[0],2)); g["variants"].append(v); keys.append(str(int(nominal)))
            attach(g,data,keys)
            g["operatingConditions"]="Tabelle originali con e senza equalizzatore: pressione lasciata null finché configurazione non selezionata; rumore e portata pubblicati conservati."
            result.append(g)
        return result
    if code=="EDQV":
        result=[]; table=tables[0]["grid"]
        for c,panel in [("EDQV",False),("EDQV-PQ",True)]:
            g=family(r,c); keys=[]
            for row in table[2:]:
                wh=pair(row[1])
                if not wh: continue
                actual=number(row[9 if panel else 4]); depth=number(row[10 if panel else 5])
                if not actual: continue
                v=variant(c,row[1],width=wh[0],height=wh[1],face=(actual,actual),depth=depth,original=original(row,table[1],2)); g["variants"].append(v); keys.append(row[1])
            attach(g,data,keys); result.append(g)
        return result
    if code=="EDC":
        table=next(t["grid"] for t in tables if t["heading"]=="Listino Prezzi"); result=[]
        for c in range(1,7):
            g=family(r,f"EDC{c}",use=["supply","return"])
            for row in table[2:]:
                wh=pair(row[0])
                if not wh or row[c] in ["-", ""]: continue
                g["variants"].append(variant(g["familyCode"],row[0],width=wh[0],height=wh[1]))
            g["geometryNote"]="Dimensioni nominali LxH da tabella produttore; cornice e profondità non ricavate dal disegno."
            g["operatingConditions"]="Configurazione EDC1–6 da listino. Tabella prestazioni comune non assegna orientamento univoco: prestazioni in verifica."
            result.append(g)
        return result
    if code in ["EDMF-S","EDMP-P","EDMP-C"]:
        table=next(t["grid"] for t in tables if t["heading"]=="Listino Prezzi")
        if code=="EDMF-S":
            for row in table[1:]:
                wh=pair(row[0])
                if wh: f["variants"].append(variant(code,row[0],width=wh[0],height=wh[1]))
        else:
            widths=table[1][1:]
            for row in table[3:]:
                h=number(row[0])
                if not h: continue
                for i,w in enumerate(widths,1):
                    if row[i] in ["-", ""]: continue
                    f["variants"].append(variant(code,f"{w}x{int(h)}",width=number(w),height=h))
        # Join matrix columns by their printed width, never by their ordinal position.
        for t in tables:
            grid=t["grid"]
            if len(grid)<3 or grid[0][0]!="H" or not re.search(r"\d+\s*m/s",grid[1][1]): continue
            velocity=number(re.search(r"(\d+)\s*m/s",grid[1][1])[1])
            columns=grid[1]
            pm=next((re.search(r"carico:\s*(\d+)\s*Pa",x[0],re.I) for x in grid if re.search(r"carico:\s*(\d+)\s*Pa",x[0],re.I)),None)
            pressure=number(pm[1]) if pm else None
            for v in f["variants"]:
                width=v["widthMm"]; height=v["heightMm"]
                column=next((i for i in range(2,len(columns)) if number(columns[i])==width),None)
                if column is None: continue
                rows=[x for x in grid if number(x[0])==height]
                flow=next((x for x in rows if re.sub(r"\s+","",x[1]) in ["m³/h","m3/h"]),None)
                sound=next((x for x in rows if x[1]=="dB(A)"),None)
                throw=next((x for x in rows if x[1]=="L(m)"),None)
                if flow and number(flow[column]) is not None and number(flow[column])>0:
                    v["operatingPoints"].append(point(number(flow[column]),pressure,sound[column] if sound else "",velocity,number(throw[column]) if throw else None,use="supply"))
        if code=="EDMF-S":
            areas=next(t["grid"] for t in tables if t["heading"]=="Sezione Efficace")
            for v in f["variants"]:
                column=next((i for i in range(2,len(areas[1])) if number(areas[1][i])==v["widthMm"]),None)
                row=next((x for x in areas[2:] if number(x[0])==v["heightMm"]),None)
                if column is not None and row: v["effectiveAreaM2"]=number(row[column])
        f["geometryNote"]="Dimensioni nominali da matrice produttore; cornice e profondità non ricavate. EDMP-C: larghezze del listino differiscono dalle colonne prestazioni; nessuna associazione per posizione."
        return result
    if code=="EDQF3":
        f["variants"]=[variant(code,"595x595",width=595,height=595,face=(595,595))]; attach(f,data,["595x595"]); return result
    # Circular fixed plates, jet diffusers, floor diffusers and valves.
    table=next(t["grid"] for t in tables if "dimension" in t["heading"].lower() and len(t["grid"])>1)
    h=next(i for i,row in enumerate(table) if "Modello" in row or any(x.startswith("Modello ") for x in row))
    headers=table[h]
    for row in table[h+1:]:
        nominal=number(re.search(r"EAM-(\d+)-VRFN",row[1])[1]) if code=="EAM-VRFN" and re.search(r"EAM-(\d+)-VRFN",row[1]) else number(modelkey(row[1]));
        if not nominal: continue
        d=int(nominal); square=code in ["EDQF1","EDQC1"]
        face=None; depth=None
        if code in ["EDCF","EDCC","EDQF1","EDQC1"]:
            face=(number(row[3]),number(row[3])); area=number(row[5])
        elif code=="EDEA-SD": face=(number(row[2]),number(row[2])); area=None
        elif code=="EDFDS": face=(number(row[2]),number(row[2])); area=None
        elif code.startswith("EVV"): face=(number(row[2]),number(row[2])); area=None
        elif code=="EVPMC": face=(number(row[3]),number(row[3])); area=None
        elif code=="EAM-VRFN": face=(number(row[3]),number(row[3])); depth=number(row[4]); area=number(row[5])
        elif code=="EDUB": face=(number(row[4]),number(row[4])); area=None
        elif code in ["EDU","EDU-S"]: face=(number(row[5]),number(row[5])); area=number(row[2])
        elif code in ["EDU-F","EDU-LFS"]: face=(number(row[7]),number(row[7])); area=number(row[2])
        else: raise ValueError(f"Unmapped geometry {code}")
        v=variant(code,d,width=face[0] if face else None,height=face[1] if square and face else None,face=face,diameter=d,depth=depth,original=original(row,headers,2)); v["effectiveAreaM2"]=area
        f["variants"].append(v); keys.append(str(d))
    f["shape"]="rectangle" if code in ["EDQF1","EDQC1"] else "circle"
    attach(f,data,keys)
    if code in ["EVVRC","EVPMC"]:
        f["use"]=["return"] if code=="EVVRC" else ["supply","return"]
        if code=="EVVRC": f["modelCodes"]=["EVVRC","EVVRB"]
        performance=next(t["grid"] for t in tables if "funzionamento" in t["heading"].lower())
        for v,key in zip(f["variants"],keys):
            rows=[row for row in performance if modelkey(row[0])==key and number(row[1]) is not None]
            v["operatingPoints"]=[point(number(row[1]),number(row[3]),row[4],openingMm=number(row[2]),settingCode=f"S={row[2]} mm",use="return" if code=="EVVRC" else "supply") for row in rows]
    if code=="EAM-VRFN":
        f["use"]=["supply","return"]
        for v,row in zip(f["variants"],table[h+1:]): v["publishedAirflowRangeM3h"]=[0,number(row[6])]
    if code in ["EDU","EDU-S"]:
        motor="EDU-M" if code=="EDU" else "EDU-SM"
        mt=next(t["grid"] for t in tables if "servomotore" in t["heading"].lower() and "Dn" in t["grid"][0]); g=family(r,motor,shape="circle")
        for row in mt[1:]:
            d=number(row[1]);
            if d: g["variants"].append(variant(motor,int(d),diameter=d,original=original(row,mt[0],2)))
        g["geometryNote"]="Quote originali versione predisposta per servomotore; involucro esterno non dedotto dalla versione manuale."
        result.append(g)
    return result


def preserve_thermal_points(record, families):
    """Archive original thermal configurations without claiming automatic compatibility."""
    if record["code"] not in ["EDRC", "EDRCS"]:
        return
    for table in record["tables"]:
        heading=table["heading"]
        if "Funzionamento" not in heading or not any(mode in heading for mode in ["Riscaldamento", "Raffrescamento"]):
            continue
        grid=table["grid"]
        angle=re.search(r"(\d+)°",heading)[1]
        mode="Riscaldamento" if "Riscaldamento" in heading else "Raffrescamento"
        groups={}
        for row in grid:
            diameter=number(row[1])
            if diameter:groups.setdefault(diameter,[]).append(row)
        for family in families:
            for variant in family["variants"]:
                rows=groups.get(variant.get("nominalDiameterMm"),[])
                if not rows:continue
                def metric(label):
                    selected=[r for r in rows if re.sub(r"\s+","",r[2])==label]
                    exact=[r for r in selected if r[0]==family["familyCode"]]
                    if exact:selected=exact
                    values={tuple(r[3:]) for r in selected}
                    return list(next(iter(values))) if len(values)==1 else None
                q=metric("m3/h") or metric("m³/h")
                # The first model's flow is a shared header directly above its diameter block.
                if q is None and rows[0] is grid[2] and re.sub(r"\s+","",grid[1][2]) in ["m3/h","m³/h"]:q=grid[1][3:]
                pressure=metric("Pa");sound=metric("dB(A)");delta=metric("Δt(°C)");velocity=metric("Vk(m/s)");throw=metric("L(m)")
                if not q or not pressure or not sound or not delta:raise ValueError("Incomplete original thermal block: "+family["familyCode"])
                for index,flow in enumerate(q):
                    if number(flow) is None:continue
                    p=point(number(flow),number(pressure[index]),sound[index],number(velocity[index]) if velocity else None,number(throw[index]) if throw else None,use="supply",settingCode=f"{mode}; pala {angle}°; Δt {delta[index]}°C")
                    p["quality"]="review"
                    p["qualityNote"]="Punto originale riferito a modalità termica, angolo pala e Δt specifici. Configurazione non ancora selezionabile nel dimensionamento automatico."
                    variant["operatingPoints"].append(p)
            family["operatingConditions"]="Punti originali distinti per riscaldamento a 35° e raffrescamento a 46°, ciascuno con Δt 10/15°C. Conservati come review; selezione automatica richiede configurazione termica esplicita."


def main():
    records=json.loads((DEST/"complete-html-tables.json").read_text(encoding="utf8"))
    records=[r for r in records if "diffusione/diffusori" in r["categories"] and r["code"] not in EXCLUDE]
    families=[]; pending=[]; inventory=[]
    for r in records:
        for source in [r["htmlSource"],*r["documents"]]:
            assert hashlib.sha256((DEST/source["filename"]).read_bytes()).hexdigest()==source["sha256"],f"Source revision changed: {source['filename']}"
        result=normalize(r)
        preserve_thermal_points(r,result)
        assert result and all(f["variants"] for f in result),f"No variants for {r['code']}"
        families.extend(result)
        inventory.append(dict(code=r["code"],sourceUrl=r["pageUrl"],familyCodes=[f["familyCode"] for f in result],variants=sum(len(f["variants"]) for f in result)))
        for f in result:
            unavailable=[v["id"] for v in f["variants"] if not v["operatingPoints"]]
            unknown=sum(1 for v in f["variants"] for p in v["operatingPoints"] if p["noiseDbA"] is None and p["noiseUpperBoundDbA"] is None)
            geometry=[v["id"] for v in f["variants"] if v["faceWidthMm"] is None or v["bodyDepthMm"] is None]
            if unavailable or unknown or geometry:
                pending.append(dict(familyCode=f["familyCode"],sourceUrl=r["pageUrl"],documentUrls=[d["sourceUrl"] for d in r["documents"]],operatingDataPending=unavailable,unknownNoisePoints=unknown,geometryPending=geometry,reason=f["operatingConditions"]))
    ids=[v["id"] for f in families for v in f["variants"]]
    assert len(ids)==len(set(ids)),"Duplicate diffuser variant IDs"
    payload=dict(families=families,inventory=inventory,pendingReport=pending)
    (DEST/"normalized-diffusers.json").write_text(json.dumps(payload,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    print(json.dumps(dict(families=len(families),variants=len(ids),operatingPoints=sum(len(v['operatingPoints']) for f in families for v in f['variants']),sourcePages=len(records)),ensure_ascii=True))

if __name__=="__main__": main()
