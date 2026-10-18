# Radiator finish sources

The generated catalog contains finite manufacturer finish whitelists. Identifiers and RAL references are product facts. Every RGB value is an indicative 3D preview value, never a certified RAL conversion or a guarantee of the delivered colour.

## Manufacturer evidence

- Cordivari: official 2025 radiator catalog, physical PDF pages 2–3, defines 76 paint/texture/metal-effect finishes. Ardesia, Claudia and Tamara technical sheets refer to this colour map. Lisa 22 imported white products are limited to R01/RAL 9010 and R02/RAL 9016. F28 Shiny Transparent is restricted to Ardesia bodies. RGB samples are median pixel readings of the rendered manufacturer swatches, with texture flattened.
- Cordivari Kristal: official accessory document defines painted kits, polished, satin, brass and antique copper valve finishes. Coloured kits are supplied with a coloured radiator, rather than sold separately. Pipe covers have their own white, polished, satin, bronze and antique-copper finishes (PDF page 9). Painted accessory selection is not applied to Lisa 22 outside its documented white finishes.
- Zehnder: Charleston and Nova official product pages expose 46 named colours and downloadable swatches. Each original swatch is archived and its SHA-256 recorded. Design Line accessory colours are limited here to the explicitly illustrated colours plus white, chrome and brushed stainless steel. The wording “almost all colours” does not establish availability of every body finish. Pipe-cover finishes remain chrome/brushed stainless steel from the official April 2024 accessory list, PDF page 11.
- Lazzarini: the official colour-map page lists RAL paint finishes, chrome and mineral finishes. The web tool returned readable primary-page text; subsequent direct HTTP downloads returned 404. This is recorded as `web-extract`, not as an archived original HTML response. Existing official family PDFs provide the independently measured white, chrome and VOV12 anthracite thermal variants. Chrome and VOV12 cannot be selected for white product families, and other VOV finishes remain unavailable until their applicable thermal data is verified. Valve/detentore finishes are limited to documented white/chrome. No documented pipe-cover finish is inferred.
- Global: the official June 2026 list defines 16 body paint finishes (PDF page 29), valve/detentore finishes (page 26), and the A446 pipe-cover/rosette colour table (page 27). Chrome code 99 is an accessory finish only. RGB values are representative screen approximations.

## Product scope

Body colour never changes the selected product family or its imported thermal output. The UI can store valve, lockshield and pipe-cover finish identifiers separately. A manufacturer kit can still require a common finish; the catalog notes this commercial restriction and does not create accessory article codes from independent preview choices.

Unrecognized manufacturer/family names have no finish whitelist. An explicit unsupported identifier resolves to `null`; a missing identifier resolves to the documented family default. Lazzarini pipe covers have no default because no official compatible finish was verified.

## Reproducibility

`fetch_radiator_finishes.py` archives primary sources and records retrieval time/hash. `build_radiator_finishes.py` builds `catalog-data/generated/radiator-finishes.json` from those sources and explicit family/role restrictions. The Cordivari page PNGs were rendered with Poppler (`pdftoppm -f 2 -l 2 -scale-to 1800 -png -singlefile` and the same command for page 3). The runtime validates references, role support and defaults; focused tests verify source hashes and prevent unsupported family/role selection.
