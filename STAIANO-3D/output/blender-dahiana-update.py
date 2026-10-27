from pathlib import Path
root=Path(__file__).resolve().parents[1]
for name in ('dahiana-daniela','teorema-angelica-plus'):
    path=root/'scripts/blender'/f'{name}.py'
    source=path.read_text(encoding='utf8')
    if name=='dahiana-daniela':
        source=source.replace('stufe-dahiana-daniela.blend','stufe-dahiana-daniela-aggiornato.blend')
    else:
        source=source.replace("root/'assets/blender'/blendfile", "root/'assets/blender'/blendfile.replace('.blend','-dahiana-update.blend')")
    exec(compile(source,str(path),'exec'),{'__file__':str(path),'__name__':'__main__'})
