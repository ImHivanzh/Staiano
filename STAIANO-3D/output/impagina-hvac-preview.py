from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).parent / 'anteprime-hvac'
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 32)
groups = [
    [('plenum-3-stacchi', 'Plenum - 3 stacchi'), ('ega6', 'Ecoclima EGA6'), ('ebl', 'Ecoclima EBL'), ('egf', 'Ecoclima EGF')],
    [('egf-push', 'Ecoclima EGF-PUSH, chiusa'), ('innova-sli', 'Innova AirLeaf SLI'), ('aermec-fcz-p-po', 'Aermec FCZ P/PO'), ('innova-osmo-sl', 'Innova OSMO SL')],
]
for index, group in enumerate(groups, 1):
    canvas = Image.new('RGB', (1800, 1300), '#22282b')
    draw = ImageDraw.Draw(canvas)
    for i, (name, label) in enumerate(group):
        x, y = (i % 2) * 900, (i // 2) * 650
        canvas.paste(Image.open(root / (name + '.png')).convert('RGB'), (x, y))
        draw.text((x + 30, y + 608), label, font=font, fill='#f5f5f2')
    canvas.save(root / f'tavola-{index}.png')
