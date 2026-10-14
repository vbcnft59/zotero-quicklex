"""Semantic extraction checks: derivations must not become false Russian lemmas."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from build_russian import compile_records, add_yo_aliases


class RussianBuildTests(unittest.TestCase):
    def test_both_language_name_partitions_and_unknown_pos(self):
        records = [
            {'word': 'мир', 'lang_code': 'ru', 'lang': '俄語', 'pos_title': '名詞', 'senses': [{'glosses': ['和平']}]},
            {'word': 'слово', 'lang_code': 'ru', 'lang': '俄语', 'pos_title': None, 'pos': 'unknown',
             'senses': [{'glosses': ['词语\n#::用语']}]},
        ]
        entries, _ = compile_records(records)
        self.assertEqual(set(entries), {'мир', 'слово'})
        self.assertIn('用语', entries['слово'][2])
        self.assertNotIn('unknown', entries['слово'][2])
        self.assertNotIn('#::', entries['слово'][2])

    def test_yo_alias_never_leaves_empty_self_reference(self):
        forms = {'сведём': ['сведем']}
        add_yo_aliases({'сведем': []}, forms)
        self.assertNotIn('сведем', forms)

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


class OpenCorporaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from russian_morphology import Morphology
        cls.morphology = Morphology()

    def test_recorded_lexemes_cover_adjectives_and_verbs_without_predictions(self):
        self.assertIn('статистические', set(self.morphology.forms_for('статистический')))
        self.assertIn('читают', set(self.morphology.forms_for('читать')))
        self.assertEqual(list(self.morphology.forms_for('ъъъъъъ')), [])
        self.assertEqual(list(self.morphology.forms_for('читает')), [])

    def test_homograph_does_not_mix_unrelated_lemmas(self):
        forms = set(self.morphology.forms_for('мыло'))
        self.assertIn('мылом', forms)
        self.assertNotIn('моют', forms)


if __name__ == '__main__':
    unittest.main()
