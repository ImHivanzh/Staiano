from pathlib import Path
root=Path(__file__).resolve().parents[1]
path=root/'scripts/blender/annabella-annalisa.py'
source=path.read_text(encoding='utf8').replace('stufe-annabella-annalisa.blend','stufe-annabella-annalisa-aggiornato.blend')
exec(compile(source,str(path),'exec'),{'__file__':str(path),'__name__':'__main__'})
