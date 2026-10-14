"""Semantic extraction checks: derivations must not become false Russian lemmas."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from build_russian import compile_records


class RussianBuildTests(unittest.TestCase):
    def test_derivation_filter_and_form_only_chain(self):
        records = [
            {'word': 'мир', 'lang_code': 'ru', 'pos_title': '名詞',
             'senses': [{'glosses': ['和平']}, {'glosses': ['世界']}],
             'forms': [{'form': 'ми́ра', 'tags': ['genitive']},
                       {'form': 'мирово́й', 'tags': ['relational', 'adjective']},
                       {'form': 'миро́к', 'tags': ['diminutive']}]},
            {'word': 'мира', 'lang_code': 'ru', 'senses': [{'form_of': [{'word': 'мир'}], 'glosses': ['屬格']}]},
            {'word': 'миру', 'lang_code': 'ru', 'senses': [{'form_of': [{'word': 'мира'}]}]},
            {'word': 'цикл', 'lang_code': 'ru', 'senses': [{'form_of': [{'word': 'цикла'}]}]},
            {'word': 'цикла', 'lang_code': 'ru', 'senses': [{'form_of': [{'word': 'цикл'}]}]},
        ]
        entries, forms = compile_records(records)
        self.assertEqual(set(entries), {'мир'})
        self.assertIn('世界', entries['мир'][2])
        self.assertEqual(forms['мира'], ['мир'])
        self.assertEqual(forms['миру'], ['мир'])
        self.assertNotIn('мировой', forms)
        self.assertNotIn('мирок', forms)
        self.assertNotIn('цикл', forms)


if __name__ == '__main__':
    unittest.main()
