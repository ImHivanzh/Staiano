from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

root = Path(__file__).parent / 'verifiche-realismo'
items = [
    ('nordica-amika-ad-bianco.png', 'La Nordica AMIKA AD'),
    ('ravelli-flexi-7-bianco.png', 'Ravelli Flexi 7'),
    ('innova-airleaf-sl-realistic.png', 'Innova AirLeaf SL'),
    ('innova-airleaf-sls-realistic.png', 'Innova AirLeaf SLS'),
    ('innova-sli-core-realistic.png', 'Innova AirLeaf SLI'),
    ('innova-osmo-sl-realistic.png', 'Innova OSMO SL'),
    ('edls-plenum-laterale.png', 'Ecoclima EDLS con plenum'),
    ('edfl-realistic-3.png', 'Ecoclima EDFL a 3 feritoie'),
]
canvas = Image.new('RGB', (1600, 1020), '#f2f2f2')
draw = ImageDraw.Draw(canvas)
font = ImageFont.truetype('arial.ttf', 23)
for i, (filename, label) in enumerate(items):
    img = Image.open(root / filename).convert('RGB')
    img.thumbnail((380, 440))
    x, y = (i % 4) * 400, (i // 4) * 510
    canvas.paste(img, (x + (400 - img.width) // 2, y + (455 - img.height) // 2))
    draw.text((x + 12, y + 465), label, fill='#202020', font=font)
canvas.save(root / 'anteprima-modelli-blender.png')
