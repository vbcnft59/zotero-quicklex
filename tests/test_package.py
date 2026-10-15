"""Check the actual release archive, including after cached Russian builds exist."""
import hashlib
import json
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class RegularPackageTests(unittest.TestCase):
    def test_archive_is_english_only_and_checksum_matches(self):
        manifest = json.loads((ROOT / 'addon/manifest.json').read_text(encoding='utf-8'))
        package = ROOT / 'dist' / ('quicklex-' + manifest['version'] + '.xpi')
        with zipfile.ZipFile(package) as archive:
            names = set(archive.namelist())
            addon = {'bootstrap.js', 'manifest.json', 'core.js', 'card.js', 'runtime.js', 'prefs.js'}
            data = {'data/metadata.json', 'data/hot.json', 'data/LICENSE-ECDICT.txt'}
            data.update(f'data/shards/{i:02x}.json' for i in range(256))
            docs = {'LICENSE', 'THIRD_PARTY_NOTICES.md', 'README.md', 'README.en.md'}
            self.assertEqual(names, addon | data | docs)
            self.assertEqual(json.loads(archive.read('data/metadata.json'))['name'], 'ECDICT')
            self.assertEqual(json.loads(archive.read('manifest.json'))['version'], manifest['version'])
            self.assertIsNone(archive.testzip())
        expected = package.with_suffix('.xpi.sha256').read_text(encoding='utf-8').split()[0]
        self.assertEqual(hashlib.sha256(package.read_bytes()).hexdigest(), expected)


if __name__ == '__main__':
    unittest.main()
