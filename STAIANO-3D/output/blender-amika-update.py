from pathlib import Path
root=Path(__file__).resolve().parents[1]
for name,old,new in (
    ('stoves-first-models','stufe-amika-flexi.blend','stufe-amika-flexi-aggiornato.blend'),
    ('amika-petra','stufa-amika-petra.blend','stufa-amika-petra-aggiornato.blend'),
):
    path=root/'scripts/blender'/f'{name}.py'
    source=path.read_text(encoding='utf8').replace(old,new)
    exec(compile(source,str(path),'exec'),{'__file__':str(path),'__name__':'__main__'})
