import importlib.util
import hashlib
from pathlib import Path
import sys
import types
import unittest

spec = importlib.util.spec_from_file_location("stoves_technical", Path(__file__).with_name("stoves-technical.py"))
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)


class StoveTechnicalTest(unittest.TestCase):
    def test_nordica_mm_and_nominal_range(self):
        result = importer.extract("<h1>AMIKA AD</h1><ul><li>Potenza nominale 3 - 8 kW</li><li>Dimensioni (LxHxP)460x1200x465 mm</li><li>Peso Netto 114 kg</li><li>Diametro scarico fumi (Ø)80 mm P</li></ul>", "AMIKA AD")
        self.assertEqual(result, {"dimensionsMm": {"widthMm": 460, "heightMm": 1200, "depthMm": 465}, "nominalPowerW": {"minW": 3000, "maxW": 8000}, "waterPowerW": None, "partLoadPowerW": None, "weightKg": 114, "flueDiameterMm": 80})

    def test_ravelli_cm_order_and_decimal_comma(self):
        result = importer.extract("<h1>Flexi <span>7</span></h1><table><tr><td>Potenza nominale (kW)</td><td>3,3 - 7,1</td></tr><tr><td>Dimensioni H x L x P (cm)</td><td>105 x 53 x 57</td></tr><tr><td>Peso Netto (Kg)</td><td>193</td></tr><tr><td>Tubo uscita fumi (Ø mm)</td><td>80 (Posteriore)</td></tr></table>", "FLEXI 7")
        self.assertEqual(result["dimensionsMm"], {"widthMm": 530, "heightMm": 1050, "depthMm": 570})
        self.assertEqual(result["nominalPowerW"], {"minW": 3300, "maxW": 7100})
        self.assertEqual(result["weightKg"], 193)
        self.assertEqual(result["flueDiameterMm"], 80)

    def test_unknown_axis_order_is_not_guessed(self):
        result = importer.extract("<h1>Modello</h1><li>Dimensioni (HxPxL) 1000x500x600 mm</li>", "Modello")
        self.assertIsNone(result["dimensionsMm"])

    def test_pinned_dimension_sheet_checks_model_hash_and_axis_order(self):
        content = b"%PDF fixture"
        sheet = {"bytes": len(content), "sha256": hashlib.sha256(content).hexdigest(), "page": 1, "model": "Easy 7", "dimensionsMm": {"widthMm": 525, "heightMm": 1030, "depthMm": 480}}
        previous = sys.modules.get("pypdf")
        sys.modules["pypdf"] = types.SimpleNamespace(PdfReader=lambda _: types.SimpleNamespace(pages=[types.SimpleNamespace(extract_text=lambda: "Modello Easy 7 ADV Dimensioni d'ingombro H x L x P / Dimensions mm 1030 x 525 x 480")]))
        try:
            self.assertEqual(importer.pdf_dimensions(content, sheet), sheet["dimensionsMm"])
            with self.assertRaisesRegex(ValueError, "revisione"):
                importer.pdf_dimensions(b"changed", sheet)
            with self.assertRaisesRegex(ValueError, "altro modello"):
                importer.pdf_dimensions(content, {**sheet, "model": "Easy 9"})
            with self.assertRaisesRegex(ValueError, "discordanti"):
                importer.pdf_dimensions(content, {**sheet, "dimensionsMm": {"widthMm": 5250}})
        finally:
            if previous is None:
                sys.modules.pop("pypdf", None)
            else:
                sys.modules["pypdf"] = previous

    def test_incompatible_page_identity_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Titolo"):
            importer.extract("<h1>Altro modello</h1><li>Dimensioni (LxHxP)460x1200x465 mm</li>", "AMIKA AD")

    def test_conflicting_published_dimensions_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "discordanti"):
            importer.extract("<h1>Modello</h1><li>Dimensioni (LxHxP)460x1200x465 mm</li><li>Dimensioni (LxHxP)470x1200x465 mm</li>", "Modello")

    def test_script_and_input_power_do_not_become_nominal_power(self):
        result = importer.extract("<h1>Modello</h1><script>Potenza nominale 99 kW</script><li>Potenza termica introdotta (kW) 8</li>", "Modello")
        self.assertIsNone(result["nominalPowerW"])

    def test_single_power_preserves_its_unit(self):
        result = importer.extract("<h1>Modello</h1><li>Potenza nominale 8,25 kW</li>", "Modello")
        self.assertEqual(result["nominalPowerW"], {"minW": 8250, "maxW": 8250})

    def test_inverted_range_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "invertito"):
            importer.extract("<h1>Modello</h1><li>Potenza nominale 8 - 3 kW</li>", "Modello")

    def test_isetta_api_record_is_cross_checked_against_page_1_and_4_of_its_pinned_pdf(self):
        content = b"%PDF-1.7 fixture"
        curated = {"articleId": 100, "articleCode": "3010340", "revisionCode": "3010340-001", "sheetName": "ISETTA CC.165.pdf", "sheetUrl": "https://storage.onpage.it/ISETTA_CC.165.pdf", "sheetSha256": hashlib.sha256(content).hexdigest(), "sheetBytes": len(content)}
        article = {"id": 100, "codice_articolo": "3010340", "nome_articolo_mkt": "ISETTA CC.165", "revisioni": [{"codice": "3010340-001", "scheda_tecnica": {"name": "ISETTA CC.165.pdf", "file": curated["sheetUrl"]}, "dimensioni_nette_l": 661, "dimensioni_nette_h": "898", "dimensioni_nette_p": 594, "potenza_termica_nominale_max": 8.2, "peso_netto": 172, "diametro_scarico_fumi_o": 150}]}
        previous = sys.modules.get("pypdf")
        sys.modules["pypdf"] = types.SimpleNamespace(PdfReader=lambda _: types.SimpleNamespace(pages=[types.SimpleNamespace(extract_text=lambda: "ISETTA CC.165 Potenza termica / Heat output / P 8,2 4,9 kW"), types.SimpleNamespace(extract_text=lambda: ""), types.SimpleNamespace(extract_text=lambda: ""), types.SimpleNamespace(extract_text=lambda: "Dimensioni apparecchio · W x H x L 661 x 898 x 594 mm · Peso netto · 172 kg")]))
        try:
            result = importer.pdf_data(article, content, curated)
        finally:
            if previous is None:
                sys.modules.pop("pypdf", None)
            else:
                sys.modules["pypdf"] = previous
        self.assertEqual(result["dimensionsMm"], {"widthMm": 661.0, "heightMm": 898.0, "depthMm": 594.0})
        self.assertEqual(result["nominalPowerW"], {"minW": 8200.0, "maxW": 8200.0})
        self.assertEqual(result["partLoadPowerW"], 4900.0)
        self.assertIsNone(result["waterPowerW"])
        self.assertEqual(result["flueDiameterMm"], 150)

    def test_isetta_pdf_rejects_drifted_dimension_or_wrong_source_hash(self):
        curated = {"articleId": 100, "articleCode": "3010340", "revisionCode": "3010340-001", "sheetName": "ISETTA CC.165.pdf", "sheetUrl": "https://storage.onpage.it/ISETTA_CC.165.pdf", "sheetSha256": "0" * 64, "sheetBytes": 4}
        with self.assertRaisesRegex(ValueError, "diversa dalla revisione"):
            importer.pdf_data({}, b"%PDF", curated)

    def test_water_power_does_not_replace_total_power_in_hero_cards(self):
        result = importer.extract("<h1>COSTANZA IDRO 5.0</h1><div>4,8-16,0 kW</div><div>Potenza termica nominale</div><div>3,3-12,0 kW</div><div>Potenza resa all'acqua</div><li>Potenza nominale 4.8 - 16 kW</li><li>Potenza resa all'acqua 3.3 - 12 kW-H₂O</li>", "COSTANZA IDRO 5.0")
        self.assertEqual(result["nominalPowerW"], {"minW": 4800, "maxW": 16000})
        self.assertEqual(result["waterPowerW"], {"minW": 3300, "maxW": 12000})


if __name__ == "__main__":
    unittest.main()
