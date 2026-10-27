"""Run a stove generator without overwriting its editable .blend file."""
from pathlib import Path
import sys
script=Path(sys.argv[sys.argv.index('--')+1]).resolve()
source=script.read_text(encoding='utf8').replace('bpy.ops.wm.save_as_mainfile(', '(lambda **kwargs: None)(')
exec(compile(source,str(script),'exec'),{'__file__':str(script),'__name__':'__main__'})
