from pathlib import Path
root=Path(__file__).resolve().parents[1]
path=root/'scripts/blender/noris-peggy.py'
source=path.read_text(encoding='utf8').replace('stufe-noris-peggy.blend','stufe-noris-peggy-aggiornato.blend')
exec(compile(source,str(path),'exec'),{'__file__':str(path),'__name__':'__main__'})
