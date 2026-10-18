"""Report every primary category entry, including pending performance and accessories."""
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/"catalog-data/sources/ecoclima"
discovery=json.loads((SOURCE/"complete-discovery.json").read_text(encoding="utf8"))
catalog=json.loads((ROOT/"catalog-data/generated/ecoclima.staging.json").read_text(encoding="utf8"))
table_records=json.loads((SOURCE/"complete-html-tables.json").read_text(encoding="utf8"))
accessories={"EPSP","ETIM","EASY","ONE-BOX","EPL","EAPRO","EBOX-N","EARS-PN","EATM","EDR","ERDR","EAB9063"}
entries=[]
for record in discovery["records"]:
    source=record.get("htmlSource")
    families=[f for f in catalog["families"] if f["sourceMetadata"]["sourceUrl"]==record["pageUrl"] or any(d["sourceUrl"]==f["sourceMetadata"]["sourceUrl"] for d in record["documents"])]
    duplicate_urls=[]
    if not families:
        table_record=next((r for r in table_records if r["pageUrl"]==record["pageUrl"]),None)
        if table_record:
            duplicate_urls=[r["pageUrl"] for r in table_records if r["code"]==record["code"] and r["pageUrl"]!=record["pageUrl"] and r["tables"]==table_record["tables"]]
            families=[f for f in catalog["families"] if f["sourceMetadata"]["sourceUrl"] in duplicate_urls]
    # The seven unchanged legacy sources can carry an older technical URL.
    if not families and record["code"] in {"EDLS","EBLF","EGQ","ETA","EVVMC","EGS","EADD"}:
        families=[f for f in catalog["families"] if f["familyCode"]==record["code"]]
    points=[p for f in families for v in f["variants"] for p in v["operatingPoints"]]
    eligible=[p for p in points if p.get("quality","valid")=="valid" and (p["noiseDbA"] is not None or p["noiseUpperBoundDbA"] is not None)]
    missing_geometry=[v["id"] for f in families for v in f["variants"] if v.get("faceWidthMm") is None or v.get("faceHeightMm") is None]
    missing_noise=sum(p["noiseDbA"] is None and p["noiseUpperBoundDbA"] is None for p in points)
    if record["code"] in accessories:status="outside-terminal-scope"; reason="Accessorio, plenum, raccordo, canale o regolatore: inventariato, non importato come terminale."
    elif not families:status="pending-normalization";reason="Pagina ufficiale acquisita, dati non ancora normalizzati con associazione tecnica verificabile."
    elif not points:status="published-models-only";reason="Modelli e quote disponibili conservati. Nessun punto operativo acustico verificato; selezione automatica esclusa."
    elif not eligible:status="performance-pending";reason="Portate e/o pressioni disponibili. Rumore assente o punti quarantinati; selezione automatica esclusa."
    elif missing_geometry or missing_noise or len(eligible)!=len(points):status="partial";reason="Prestazioni pubblicate utilizzabili solo per punti validi con rumore noto; quote o configurazioni mancanti restano esplicite."
    else:status="verified-published-tables";reason="Quote frontali e punti acustici delle tabelle pubblicate normalizzati; profondità e configurazioni aggiuntive non dichiarate restano nulle."
    entries.append({"code":record["code"],"name":record["name"],"pageUrl":record["pageUrl"],"categories":record["categories"],"status":status,"reason":reason,"identicalTablePageUrls":duplicate_urls,"familyCodes":[f["familyCode"] for f in families],"variantCount":sum(len(f["variants"]) for f in families),"publishedOperatingPoints":len(points),"validAcousticPoints":len(eligible),"unknownNoisePoints":missing_noise,"quarantinedPoints":sum(p.get("quality")=="review" for p in points),"missingFrontGeometryVariantIds":missing_geometry,"htmlSource":source,"documents":record["documents"],"images":record["images"],"acquisitionErrors":record["errors"]})
output={"catalogVersion":catalog["version"],"scope":"Tutte le pagine prodotto presenti nelle quattro categorie ufficiali Ecoclima: diffusori, bocchette, griglie e bocchette/griglie/plenum VMC. Duplicati fra categorie preservati come provenienza; accessori esclusi dal dimensionamento terminali.","categorySources":discovery["categories"],"totals":{"officialPages":len(entries),"terminalPages":sum(e["status"]!="outside-terminal-scope" for e in entries),"outsideScopePages":sum(e["status"]=="outside-terminal-scope" for e in entries),"pendingNormalizationPages":sum(e["status"]=="pending-normalization" for e in entries),"normalizedFamilies":len(catalog["families"]),"normalizedVariants":sum(len(f["variants"]) for f in catalog["families"]),"statusCounts":{status:sum(e["status"]==status for e in entries) for status in sorted({e["status"] for e in entries})}},"requestedNameResolution":{"EDLS":"EDLS / EDLSB","EDSC-C/Q":["EDSC-C","EDSC-CC","EDSC-Q"],"EGA PUSH":{"officialFamilyCode":"EGA6","closure":"push-pull su richiesta; nessuna famiglia autonoma EGA-PUSH pubblicata nelle categorie acquisite","otherPublishedPushFamilies":["EGQ-PUSH","EGQR-PUSH","EGF-PUSH","EGFR-PUSH"]}},"entries":entries}
(ROOT/"catalog-data/generated/ecoclima.inventory.json").write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding="utf8")
print(json.dumps(output["totals"]))
if output["totals"]["pendingNormalizationPages"]:raise ValueError("Terminal category entries remain unnormalized")
