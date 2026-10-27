"""Apply Blender modifiers during exports, preserving existing editable scenes."""
from pathlib import Path
import subprocess,sys
root=Path(__file__).resolve().parents[1]
folder=root/'scripts/blender'
names=['stoves-first-models','angelica-evo','dahiana-daniela','debby-evo','edls-realistic',
       'annabella-annalisa','evelyne-floriana','iside-isidora','katia-evo','ketty-50','klaudia-ad-evo','lucia-luisella','marilena-sharon','nordica-concita-dante','nordica-ester-fedora-gemma','nordica-ghisa-classica','nordica-jennifer-liu-nova','nordica-legna-inizio','nordica-ultimi','noris-peggy','ravelli-block-luna','ravelli-hoop-mild-easy','ravelli-hrv','ravelli-legna','ravelli-primi-modelli','ravelli-r-rv','ravelli-slim','souvenir-plus','teodora-evo','terry-costanza',
       'amika-petra','guenda-idro-evo','mariella-ad','marina-miriana','nordica-rossella','raffaella-rosanna-virna','ravelli-dual-s','ravelli-flexi-9','ravelli-hrv-varianti','ravelli-varianti-easy-vittoria','ravelli-varianti-canalizzate','sabry-ad','teorema-angelica-plus']
names.remove('edls-realistic')
blender=r'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
for name in names:
    path=folder/(name+'.py'); source=path.read_text(encoding='utf8')
    lines=source.splitlines(keepends=True);updated=[]
    for line in lines:
        if 'bpy.ops.export_scene.gltf(' in line and 'export_apply=' not in line:
            line=line.replace('use_selection=True','use_selection=True,export_apply=True')
        updated.append(line)
    changed=''.join(updated)
    if changed!=source:path.write_text(changed,encoding='utf8')
    run=subprocess.run([blender,'--background','--python-exit-code','1','--python',str(root/'output/blender-export-only.py'),'--',str(path)],cwd=root,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,encoding='utf8',errors='replace',creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    if run.returncode:
        print('FAILED',name,run.stdout[-3000:],flush=True);sys.exit(run.returncode)
    print('OK',name,flush=True)
run=subprocess.run([sys.executable,str(folder/'export-varianti-plus.py')],cwd=root)
sys.exit(run.returncode)
