"""Regression checks against the archived official Ecoclima commercial source rows."""
import hashlib
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2] / "catalog-data" / "sources" / "ecoclima-commercial-official"


class OfficialPriceExtractionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((ROOT / "normalized-workbook-prices.json").read_text(encoding="utf-8"))

    def find(self, family, model, **dimensions):
        return [price for price in self.data["prices"] if price["familyCode"] == family and price["modelCode"] == model
                and all(price["dimensions"][key] == value for key, value in dimensions.items())]

    def test_edls_published_profile_and_malformed_black_cells(self):
        price = self.find("EDLS", "EDLS20-FA", lengthMm=1000, slotCount=1, slotWidthMm=20)
        self.assertEqual(len(price), 1)
        self.assertEqual((price[0]["colorCode"], price[0]["unitPriceCents"]), ("RAL9005", 6365))
        for length in (1200, 1500, 2000):
            self.assertEqual(self.find("EDLS", "EDLS30-FA", lengthMm=length, slotCount=2, slotWidthMm=20), [])
        malformed = {(item.get("sourceRow"), item.get("sourceColumn"), item.get("value")) for item in self.data["issues"]
                     if item["familyCode"] == "EDLS" and item["sourceUrl"].endswith("?locale=it") and "Malformed" in item["reason"]}
        self.assertEqual(malformed, {(18, 5, "150,00 0"), (19, 5, "167,26 0"), (20, 5, "214,13 0")})

    def test_linear_bridges_and_continuity_prices(self):
        for family, bridge_cents, kit_cents, expected_bridges in (("EDLS", 1272, 239, 5), ("EDFL", 1272, 239, 4), ("EDFLNA", 699, 1416, 4)):
            bridges = [price for price in self.data["prices"] if price["familyCode"] == family and price["kind"] == "fixing-bridge"]
            kits = [price for price in self.data["prices"] if price["familyCode"] == family and price["kind"] == "continuity-kit"]
            self.assertEqual(len(bridges), expected_bridges)
            self.assertEqual({price["unitPriceCents"] for price in bridges}, {bridge_cents})
            self.assertEqual(len(kits), 1)
            self.assertEqual(kits[0]["unitPriceCents"], kit_cents)
            self.assertFalse(any(kits[0]["dimensions"].values()))

    def test_erdr_flow_ranges_and_emtd_diameters_are_distinct_prices(self):
        erdr = [price for price in self.data["prices"]
                if price["familyCode"] == "ERDR" and price["dimensions"]["diameterMm"] == 250]
        self.assertEqual({price["catalogSizeCode"]: price["unitPriceCents"] for price in erdr}, {
            "250 · 50 - 100 m³/h": 10870,
            "250 · 100 - 180 m³/h": 10870,
            "250 · 180 - 300 m³/h": 10870,
            "250 · 300 - 500 m³/h": 10870,
            "250 · 450 - 700 m³/h": 12456,
        })
        emtd = sorted((price["dimensions"]["diameterMm"], price["unitPriceCents"])
                     for price in self.find("EVALI", "EMTD"))
        self.assertEqual(emtd, [(80, 1814), (125, 1631)])
        self.assertFalse(any(issue["familyCode"] in ("ERDR", "EVALI") and
                             "Conflicting published SKU prices" in issue["reason"]
                             for issue in self.data["issues"]))

    def test_official_html_fills_exporter_plenum_omissions(self):
        for family in ("EGA1-4", "EGA6", "EGQ-PUSH"):
            upper = [price for price in self.find(family, "EPI", widthMm=200, heightMm=200) if price["connectionPosition"] == "upper"]
            lateral = [price for price in self.find(family, "EPI", widthMm=200, heightMm=200) if price["connectionPosition"] == "lateral"]
            self.assertEqual([price["unitPriceCents"] for price in upper], [4896])
            self.assertEqual([price["unitPriceCents"] for price in lateral], [5400])
            self.assertEqual(upper[0]["sourceMetadata"]["sourceType"], "html")
        quadrotti = [price for price in self.find("EGQ-PUSH", "EPI", widthMm=560, heightMm=560) if price["connectionPosition"] == "lateral"]
        self.assertEqual([price["unitPriceCents"] for price in quadrotti], [12801])

    def test_fixing_kits_and_motor_accessories_do_not_become_terminals(self):
        fixing = self.find("EBLF", "K-EBLF")
        self.assertEqual([(price["kind"], price["unitPriceCents"]) for price in fixing], [("fixing-kit", 3090)])
        for family, model in (("EDEA-SD", "EDEA-SD"), ("EGA-ONE", "EGAFQ-ONE 1")):
            terminal = self.find(family, model)
            self.assertTrue(terminal)
            self.assertEqual({price["kind"] for price in terminal}, {"terminal"})
        for price in self.data["prices"]:
            if "Servomotori" in price["modelCode"]:
                self.assertEqual(price["kind"], "accessory")
            if price["modelCode"].startswith("EPI"):
                self.assertEqual(price["kind"], "insulated-plenum")
            if price["kind"] == "terminal" and not any(price["dimensions"].values()):
                self.assertIsNotNone(price["catalogSizeCode"])

    def test_named_component_axes_are_retained_without_face_assumptions(self):
        price = self.find("EAMV-V", "EAMV-102-V")[0]
        self.assertFalse(any(price["dimensions"].values()))
        self.assertEqual(price["originalDimensionsMm"], {"L": 15, "ØD": 100})

    def test_official_source_revision_hashes_are_immutable(self):
        manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
        for family in manifest["families"]:
            for source in family["sources"]:
                self.assertEqual(hashlib.sha256((ROOT / source["filename"]).read_bytes()).hexdigest(), source["sha256"])
                self.assertEqual((ROOT / source["filename"]).read_bytes(), (ROOT / source["immutableFilename"]).read_bytes())
        self.assertEqual(len(self.data["prices"]), len({price["id"] for price in self.data["prices"]}))


if __name__ == "__main__":
    unittest.main()
