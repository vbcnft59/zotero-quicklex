"""DSL extraction and explicit morphology checks for the Russian dictionary."""
import io
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from build_russian import compile_dsl, plain_text, add_yo_aliases


class RussianBuildTests(unittest.TestCase):
    def test_dsl_keeps_senses_pinyin_examples_and_literal_brackets(self):
        source = r'''#NAME "Test"
статистический
 [m1]统计\[的\] tǒngjì\[de\][/m][m2][*][ex]статистические данные - 统计材料[/ex][/*][/m]

мир
 [m1]1) 和平[/m][m1]2) 世界[/m]
'''
        entries, _ = compile_dsl(io.StringIO(source))
        self.assertIn('统计[的] tǒngjì[de]', entries['статистический'][2])
        self.assertIn('\n例：статистические данные - 统计材料', entries['статистический'][2])
        self.assertIn('1) 和平\n2) 世界', entries['мир'][2])
        self.assertNotIn('[m1]', entries['мир'][2])
        self.assertEqual(entries['статистический'][4], 'статистический')
        self.assertEqual(plain_text('<script>alert(1)</script>'), '<script>alert(1)</script>')

    def test_reference_only_articles_aliases_and_cycles(self):
        source = '''\ufeff#INDEX_LANGUAGE "Russian"\r
мир\r
свет\r
 [m1]世界[/m]\r
\r
вселенная\r
 [m1][ref]мир[/ref][/m]\r
\r
цикл\r
 [m1][ref]цикла[/ref][/m]\r
\r
цикла\r
 [m1][ref]цикл[/ref][/m]\r
\r
пусто\r
 [m1][ref]нет-слова[/ref][/m]\r
'''
        entries, forms = compile_dsl(io.StringIO(source))
        self.assertEqual(set(entries), {'мир', 'свет', 'вселенная'})
        self.assertIn('参见：мир\n世界', entries['вселенная'][2])
        self.assertEqual(forms, {})  # Cross-references are not inflections.

    def test_filter_stress_yo_and_unindented_chinese_continuation(self):
        source = '''учёный
 [m1]科学家[/m]

НАУ́КА
 [m1]科学
知识[/m]

два слова
 [m1]短语[/m]

нaука
 [m1]混合字母[/m]
'''
        entries, forms = compile_dsl(io.StringIO(source))
        self.assertEqual(set(entries), {'учёный', 'наука'})
        self.assertIn('知识', entries['наука'][2])
        self.assertEqual(forms['ученый'], ['учёный'])
        forms = {'сведём': ['сведем']}
        add_yo_aliases({'сведем': []}, forms)
        self.assertNotIn('сведем', forms)


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
