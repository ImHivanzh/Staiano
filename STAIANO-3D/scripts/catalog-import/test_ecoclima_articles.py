import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("articles", Path(__file__).with_name("ecoclima-articles.py"))
articles = importlib.util.module_from_spec(spec)
spec.loader.exec_module(articles)


class ArticleMappingTest(unittest.TestCase):
    def test_keeps_exact_cell_identity_across_row_and_column_spans(self):
        html = """<h4>Listino Prezzi EDLS-FA - 1 Feritoia da 20 mm - RAL9005</h4>
        <table><tr><td>EDLS-FA</td><td>Lunghezza</td><td>EDLS10-FA</td></tr>
        <tr><td>1 Feritoia</td><td></td><td>€</td></tr>
        <tr><td rowspan='2'>Feritoia da 20 mm</td><td>800</td><td><a data-code='DDS0000010'>53,99</a></td></tr>
        <tr><td>1000</td><td><a data-code='DDS0000011'>59,61</a></td></tr></table>"""
        mapped = articles.price_articles({"code": "EDLS", "name": "EDLS - EDLSB", "pageUrl": "https://www.ecoclima.com/test"}, html)
        self.assertEqual(mapped["ecoclima-d5f9e4cc1b49a44073818c38"], {"DDS0000010"})
        self.assertEqual(len(mapped), 2)
        self.assertIn({"DDS0000011"}, mapped.values())


if __name__ == "__main__":
    unittest.main()
