"""Source-backed checks for the Ecoclima ETF10 flexible-tube catalog."""
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/catalog-import/ecoclima-flexible-ducts.py"
SOURCE = next((ROOT / "catalog-data/sources/ecoclima").glob("etf10-*.pdf"))
SPEC = importlib.util.spec_from_file_location("ecoclima_flexible_ducts", SCRIPT)
IMPORTER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(IMPORTER)


class EcoclimaFlexibleDuctTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.product = IMPORTER.build_catalog(SOURCE)["products"][0]

    def loss(self, diameter, airflow):
        return next(
            row["pressureDropPaM"]
            for row in self.product["pressureLosses"]
            if row["diameterMm"] == diameter and row["airflowM3h"] == airflow
        )

    def test_published_geometry_and_limits(self):
        self.assertEqual(self.product["diametersMm"], [80, 102, 127, 152, 160, 180, 203, 254, 305, 318, 356, 406, 457, 508, 610])
        self.assertEqual(self.product["minimumBendRadiusFactor"], 0.6)
        self.assertEqual(self.product["maxAirVelocityMs"], 20)
        self.assertEqual(self.product["maxPressurePa"], 2000)
        self.assertEqual(self.product["standardLengthM"], 10)
        self.assertIsNone(self.product["supportSpacingMm"])

    def test_published_pressure_loss_points_remain_exact(self):
        self.assertEqual(self.loss(80, 80), 6.5)
        self.assertEqual(self.loss(102, 100), 3)
        self.assertEqual(self.loss(160, 200), 1.3)
        self.assertEqual(self.loss(610, 30000), 18)


if __name__ == "__main__":
    unittest.main()
