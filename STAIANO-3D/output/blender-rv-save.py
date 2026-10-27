from pathlib import Path
script=Path(__file__).resolve().parents[1]/'scripts/blender/ravelli-r-rv.py'
source=script.read_text(encoding='utf8').replace('assets/blender/stufe-ravelli-r-rv.blend','assets/blender/stufe-ravelli-r-rv-aggiornato.blend')
exec(compile(source,str(script),'exec'),{'__file__':str(script),'__name__':'__main__'})
