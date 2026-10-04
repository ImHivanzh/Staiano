"""Expand native HTML rowspan/colspan with their original source coordinates."""
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path

class GridParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.tables=[]; self.table=None; self.row=None; self.cell=None; self.heading=None; self.heading_parts=[]; self.section=""; self.text=[]; self.depth=0
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if tag in ["h1","h2","h3","h4"]: self.heading=tag; self.heading_parts=[]
        if tag=="table":
            if self.table is not None: raise ValueError("Nested source tables require explicit normalization")
            self.table={"heading":self.section,"rows":[]}; self.depth=1
        elif tag=="tr" and self.table is not None: self.row=[]
        elif tag in ["td","th"] and self.row is not None:
            self.cell={"text":[],"rowspan":int(a.get("rowspan",1)),"colspan":int(a.get("colspan",1))}
        elif tag=="br" and self.cell is not None: self.cell["text"].append(" ")
    def handle_data(self, data):
        if self.heading is not None: self.heading_parts.append(data)
        if self.cell is not None: self.cell["text"].append(data)
        self.text.append(data)
    def handle_endtag(self, tag):
        if tag==self.heading:
            self.section=re.sub(r"\s+"," "," ".join(self.heading_parts)).strip(); self.heading=None
        if tag in ["td","th"] and self.cell is not None:
            self.cell["text"]=re.sub(r"\s+"," "," ".join(self.cell["text"])).strip(); self.row.append(self.cell); self.cell=None
        elif tag=="tr" and self.row is not None: self.table["rows"].append(self.row); self.row=None
        elif tag=="table" and self.table is not None:
            grid={}; origins={}
            for r,row in enumerate(self.table["rows"]):
                c=0
                for cell in row:
                    while (r,c) in grid: c+=1
                    if min(cell["rowspan"],cell["colspan"])<1: raise ValueError("Nonpositive table span")
                    for dr in range(cell["rowspan"]):
                        for dc in range(cell["colspan"]):
                            key=(r+dr,c+dc)
                            if key in grid: raise ValueError("Overlapping source span")
                            grid[key]=cell["text"]; origins[key]=[r,c]
                    c+=cell["colspan"]
            height=max((r for r,c in grid),default=-1)+1; width=max((c for r,c in grid),default=-1)+1
            self.tables.append({"heading":self.table["heading"],"grid":[[grid.get((r,c),"") for c in range(width)] for r in range(height)],"origins":[[origins.get((r,c)) for c in range(width)] for r in range(height)]}); self.table=None

if __name__=="__main__":
    root=Path(__file__).resolve().parents[2]/"catalog-data/sources/ecoclima"
    discovery=json.loads((root/"complete-discovery.json").read_text(encoding="utf8")); output=[]
    for record in discovery["records"]:
        if "htmlSource" not in record: continue
        source=record["htmlSource"]; data=(root/source["filename"]).read_bytes()
        if hashlib.sha256(data).hexdigest()!=source["sha256"]: raise ValueError("HTML revision changed")
        parser=GridParser(); parser.feed(data.decode("utf8"))
        output.append({**record,"tables":parser.tables})
        print(record["code"],[(t["heading"],len(t["grid"]),max(map(len,t["grid"]),default=0)) for t in parser.tables],flush=True)
    (root/"complete-html-tables.json").write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding="utf8")
