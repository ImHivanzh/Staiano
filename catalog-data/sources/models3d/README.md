# Manufacturer 3D source acquisition

18 Cordivari Ardesia OBJ files downloaded from the public official Italian product pages.
Local originals are cached here (ignored by Git); GLB conversions are in `public/models3d`.
`catalog-data/generated/models3d.json` records source URL, revision, retrieval date, source and GLB SHA256, byte counts, triangle counts, catalogue dimensions and independently measured mesh dimensions.

Run `python scripts/catalog-import/models3d.py` with the bundled Python. Use `--refresh` to fetch source files again. Cached runs preserve retrieval timestamps.

Conversion preserves geometry and normals: millimetres to metres, a rigid 180-degree Z rotation, centring, deduplicating identical position/normal pairs, one neutral material. No mesh is stretched to fit a catalogue product. All GLB buffers are embedded; external materials, textures and scripts are not fetched or executed.

Every published mesh has a width 9.2 mm larger than the current catalogue formula with caps: 493.2 versus 484 mm for ten elements, 723.2 versus 714 mm for fifteen, 1183.2 versus 1174 mm for twenty-five. Height and depth largely agree. The reason for the width difference is not established. Consequently these assets are available in the catalogue preview and for local download, but are excluded from verified project placement. The technical project envelope continues to use the catalogue dimensions. No dimension correction is invented.

Official page example: https://www.cordivari.it/prodotto/radiatore-tubolare-ardesia-2-colonne/

Copyright remains with the manufacturer. Public design downloads do not state an open redistribution licence. Current acquisition is for the user's internal design application. Review rights with the manufacturer before public redistribution or deployment of asset binaries.

Also acquired the public Gree Italy download archive (33,865,431 bytes):
https://service.argoonline.it//area_riservata/WebDocTec/gree.argoclima.com/FilesBIM.zip
Linked by https://www.greeitalia.it/download . Archive contents are Revit `.rfa` families for GMV, Versati and modular chillers. The archive is stored unchanged, inspected as ZIP metadata only, with no execution or automatic conversion. These families do not match the currently normalized GUD ducted units; no GMV family is substituted for a GUD model.

Daikin publishes a BIM library at https://www.daikin.it/it_it/cataloghi-e-app/bim.html and https://www.daikin-bim-library.daikin.com/DKG-BIMDOWNLOAD/ . Mitsubishi publishes design families via manufacturer-linked MEPcontent. Ecoclima and Global searches did not locate directly usable official OBJ/GLB files for the configured families. No paid, unrelated or unlicensed third-party model was imported.
