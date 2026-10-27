from pathlib import Path
root=Path(__file__).resolve().parents[1]
for name in ('angelica-evo','teorema-angelica-plus'):
    path=root/'scripts/blender'/f'{name}.py'
    source=path.read_text(encoding='utf8')
    if name=='angelica-evo':
        source=source.replace('assets/blender/stufe-angelica.blend','assets/blender/stufe-angelica-aggiornato.blend')
    else:
        source=source.replace("root/'assets/blender'/blendfile", "root/'assets/blender'/blendfile.replace('.blend','-aggiornato.blend')")
    exec(compile(source,str(path),'exec'),{'__file__':str(path),'__name__':'__main__'})
