import re


def bi2_naked_products(pages, metadata):
    speed_labels = ("Bassa", "Media", "Alta")
    products = []

    def row(text, label, columns):
        line = next(line for line in text.splitlines() if line.startswith(label))
        unit = next(unit for unit in ("kW", "dB(A)", "m³/h", "m3/h") if unit in line)
        values = [
            float(value.replace(",", "."))
            for value in re.findall(
                r"(?<!\w)\d+(?:[.,]\d+)?", line.split(unit, 1)[-1]
            )
        ]
        if len(values) != columns * len(speed_labels):
            raise ValueError(f"Ambiguous original row Bi2 Naked: {label}, {values}")
        return values

    def add_family(text, page, sizes, widths, height, depth, sli_codes, slir_codes):
        cooling = row(text, "Potenza resa totale in raffreddamento", len(sizes))
        heating = row(text, "Potenza resa totale in riscaldamento a20/15 - w45/40", len(sizes))
        noise = row(text, "Pressione sonora", len(sizes))
        airflow = row(text, "Portata d’aria", len(sizes))
        for family, prefix, codes, mountings in [
            ("Bi2 Naked SLI", "SLI", sli_codes, ["wall", "ceiling"]),
            ("Bi2 Naked SLIR", "SLIR", slir_codes, ["wall"]),
        ]:
            for size_index, size in enumerate(sizes):
                points = []
                for speed_index, label in enumerate(speed_labels):
                    index = size_index * len(speed_labels) + speed_index
                    points.append({
                        "label": label,
                        "coolingW": cooling[index] * 1000,
                        "heatingW": heating[index] * 1000,
                        "airflowM3h": airflow[index],
                        "noiseDbA": noise[index],
                        "coolingConditions": "Acqua 7/12 °C; aria 27 °C b.s. / 19 °C b.u.",
                        "heatingConditions": "Acqua 45/40 °C; aria 20 °C b.s. / 15 °C b.u.",
                        "noiseConditions": "Pressione sonora: ambiente 100 m³, riverbero 0,5 s, installazione a pavimento/soffitto, 1/4 sfera a 3 m.",
                    })
                products.append({
                    "id": f"olimpia-{codes[size_index]}",
                    "manufacturer": "Olimpia Splendid",
                    "family": family,
                    "model": f"{prefix} {size}",
                    "pipes": "2",
                    "widthMm": widths[size_index],
                    "heightMm": height,
                    "depthMm": depth,
                    "recessDepthMm": 142,
                    "mountings": mountings,
                    "dimensionNote": f"Corpo {widths[size_index]}×{height}×{depth} mm; cassaforma 142 mm per incasso a parete con pannello metallico SLI o radiante SLIR. Con griglie verificare plenum e spazio tecnico della posa.",
                    "features": ["Installazione ad incasso", "Motore DC brushless", "Bi2 Naked"],
                    "productPhoto": None,
                    "operatingPoints": points,
                    "sourceMetadata": metadata(page),
                })

    add_family(
        pages[21], 22, [200, 400, 600, 800], [525, 725, 925, 1125], 576, 126,
        ["01513", "01514", "01515", "01516"],
        ["01639", "01640", "01641", "01642"],
    )
    add_family(
        pages[23], 24, [1100, 1400, 1600], [1110, 1110, 1180], 599, 198,
        ["02363", "02056", "02057"],
        ["02364", "02071", "02072"],
    )
    return products
