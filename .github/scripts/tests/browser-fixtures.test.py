import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile

SCRIPT = Path(__file__).resolve().parent.parent / 'prepare-browser-fixtures.py'
spec = importlib.util.spec_from_file_location('fixtures', SCRIPT)
fixtures = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixtures)


class FixturesTest(unittest.TestCase):
    def test_repeated_generation_has_identical_bytes_and_hashes(self):
        with tempfile.TemporaryDirectory() as root:
            a, b = Path(root) / 'a', Path(root) / 'b'
            self.assertEqual(fixtures.prepare(a), fixtures.prepare(b))
            manifest = json.loads((a / 'manifest.json').read_text())
            self.assertEqual(len(manifest['files']), 7)
            for record in manifest['files']:
                data = (a / record['name']).read_bytes()
                self.assertEqual(data, (b / record['name']).read_bytes())
                self.assertEqual(hashlib.sha256(data).hexdigest(), record['sha256'])
                self.assertEqual(len(data), record['bytes'])

    def test_office_documents_have_real_content_and_complete_relationships(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            fixtures.prepare(root)
            for name, part, expected in [('docx', 'word/document.xml', 'Factory DOCX sample'), ('xlsx', 'xl/worksheets/sheet1.xml', 'Factory XLSX sample'), ('pptx', 'ppt/slides/slide1.xml', 'Factory PPTX sample')]:
                with zipfile.ZipFile(root / f'sample.{name}') as archive:
                    self.assertIsNone(archive.testzip())
                    self.assertIn(expected, archive.read(part).decode())
                    for item in archive.namelist():
                        ET.fromstring(archive.read(item))
                    if name == 'pptx':
                        self.assertIn('ppt/slides/_rels/slide1.xml.rels', archive.namelist())
                        self.assertIn('ppt/theme/theme1.xml', archive.namelist())
                        slide = ET.fromstring(archive.read(part))
                        transform = slide.find('.//{http://schemas.openxmlformats.org/presentationml/2006/main}sp/{http://schemas.openxmlformats.org/presentationml/2006/main}spPr/{http://schemas.openxmlformats.org/drawingml/2006/main}xfrm/{http://schemas.openxmlformats.org/drawingml/2006/main}ext')
                        self.assertGreater(int(transform.attrib['cx']), 0)

    def test_pdf_offsets_and_corrupt_input_are_distinct(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            fixtures.prepare(root)
            pdf = (root / 'sample.pdf').read_bytes()
            offset = int(pdf.split(b'startxref\n')[1].splitlines()[0])
            self.assertTrue(pdf[offset:].startswith(b'xref'))
            self.assertIn(b'Factory PDF sample', pdf)
            self.assertTrue((root / 'sample.png').read_bytes().startswith(b'\x89PNG'))
            self.assertFalse((root / 'corrupt.png').read_bytes().startswith(b'\x89PNG'))


if __name__ == '__main__':
    unittest.main()
