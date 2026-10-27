"""Versioni Plus con foto e ingombro uguali ai modelli già modellati in Blender."""
from pathlib import Path
from shutil import copyfile
root=Path(__file__).resolve().parents[2]/'public/models/stoves'
models={
    'nordica-dahiana-plus-ad':('nordica-dahiana-ad',['bronzo','nero','bordeaux','avorio']),
    'nordica-daniela-plus':('nordica-daniela',['nero','avorio','tortora-matt','grigio-grafite']),
    'nordica-klaudia-plus-ad-evo':('nordica-klaudia-ad-evo',['nero','bordeaux','bianco']),
    'nordica-lucia-plus16':('nordica-lucia16',['tortora','bordeaux','bianco']),
    'nordica-mariella-plus-ad':('nordica-mariella-ad',['avorio','bordeaux','nero']),
    'nordica-noris-plus-evo':('nordica-noris-evo',['bronzo','bianco','tortora-matt']),
    'nordica-noris-plus-lux-evo':('nordica-noris-lux-evo',['tortora','bianco']),
    'nordica-teorema-plus-ad':('nordica-teorema-ad',['nero','avorio','bordeaux']),
}
for target,(source,colors) in models.items():
    for color in colors:copyfile(root/f'{source}-{color}.glb',root/f'{target}-{color}.glb')
