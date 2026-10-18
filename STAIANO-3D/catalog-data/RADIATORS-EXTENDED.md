# Additional manufacturer radiator catalogs

The runtime includes 312 additional documented variants alongside the unchanged
Cordivari Ardesia and Global catalogs. Existing IDs and catalog versions remain
valid; new snapshots are appended to `generated/radiator-history.json`.

| Catalog | Scope | Variants |
| --- | --- | ---: |
| Cordivari Comfort | Lisa 22 R01 standard, Claudia R01 standard, Tamara vertical factory assemblies | 61 |
| Zehnder | Charleston 2–6 columns including published Retrofit sizes; Nova Easy vertical ZNV/ZNVL/ZNVV/ZNVLV | 188 |
| Lazzarini | Sanremo straight white/chrome/anthracite; Garda white/black; Empoli white/chrome/anthracite | 63 |

Every heat-output exponent is published by the manufacturer. No generic exponent,
invented element heat output, or interpolated commercial dimension is used.
Fixed products have `construction: "fixed"`, complete-product width in `pitchMm`,
`commercialElementCounts: [1]`, and complete-product output in the legacy
`elementOutputW` field. Labels must say radiator/unit for these products. Their
`interaxisMm` describes a horizontal pipe connection, so it can exceed height.

Charleston uses exact technical-table heights, not rounded model height. Minimum
three elements and maximum per battery come from the original June 2026 price
list. Width includes published plug projections: 21 mm for two columns, 26 mm for
three to six columns. Tamara uses the manufacturer's per-element table and only
factory assemblies from five to thirty elements.

Nova's PDF text layer contains invisible drawing labels crossing several table
cells. Its 32 Easy vertical rows were transcribed from rendered pages 4–5. The
published 110 mm depth for ZNVLV-200-007 is retained, even though adjacent rows
say 113 mm. Custom M2M and horizontal Nova sizes are outside this bounded import.
The curated rows are locked to the checked PDF SHA-256; a changed publisher file
requires visual review before the importer accepts a new revision.

Lazzarini's publisher-linked original PDFs remain available from its official
document service. At retrieval the current website returned a “Coming soon”
page; the original product pages were independently verified through indexed
manufacturer pages. Revisions are recorded honestly (2021/2023), rather than
presented as new 2026 specifications. Sanremo curved variants are excluded.
Chrome has lower published output than white; a finish selection must not move
white output onto a chrome product. Sanremo depth is a schematic conservative
envelope from the documented collector section. Empoli depth is derived from the
dimensioned wall drawing and explicitly marked schematic. Nominal width and
height remain published values. These models do not claim certified CAD geometry.

`sources/radiators-extended-manifest.json` records publisher URLs, PDF revisions,
retrieval dates, SHA-256 hashes, page counts, and image provenance. Original family
photographs are local under `public/catalog-assets/radiators`; they illustrate
shape and do not promise the selected height, finish, or connection arrangement.
Lazzarini photos are original image streams extracted from the publisher's PDF
cover. Other photos are unchanged files from manufacturer product pages.

## Reproduction

Use the bundled Python runtime with `pdfplumber` and `pypdf`:

```powershell
python scripts/catalog-import/acquire-radiators-extended.py
python scripts/catalog-import/radiators-extended.py
```

The first command reuses acquired snapshots by default; `--refresh` deliberately
updates sources. The second stages catalogs and reports. Validate staged JSON
with `radiatorCatalogSchema`, inspect source and removal reports, then apply:

```powershell
python scripts/catalog-import/radiators-extended.py --apply
```

Unchanged content keeps catalog versions, imported timestamps, and prior history.
Missing rows or removed model IDs fail the import for explicit review.
