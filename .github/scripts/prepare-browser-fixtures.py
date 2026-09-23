#!/usr/bin/env python3
"""Deterministic, offline browser inputs. No application state or model calls.

OOXML packages include actual document content and PPTX layout/master/theme
relationships, with explicit shape geometry. Corrupt inputs are separate cases.
"""
import hashlib
import io
import json
from pathlib import Path
import struct
import sys
import xml.etree.ElementTree as ET
import zipfile
import zlib

XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
OFFICE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
DRAW = 'http://schemas.openxmlformats.org/drawingml/2006/main'
PRES = 'http://schemas.openxmlformats.org/presentationml/2006/main'


def rels(items):
    return XML + f'<Relationships xmlns="{REL}">' + ''.join(
        f'<Relationship Id="{id_}" Type="{OFFICE}/{kind}" Target="{target}"/>'
        for id_, kind, target in items
    ) + '</Relationships>'


def package(parts, overrides):
    parts = dict(parts)
    parts['[Content_Types].xml'] = XML + (
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
    ) + ''.join(f'<Override PartName="/{name}" ContentType="{mime}"/>' for name, mime in overrides.items()) + '</Types>'
    data = io.BytesIO()
    with zipfile.ZipFile(data, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for name, text in sorted(parts.items()):
            ET.fromstring(text)
            info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, text.encode())
    return data.getvalue()


def png():
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    pixels = b''.join(b'\x00' + bytes([40, 110, 190] * 32) for _ in range(32))
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 32, 32, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(pixels)) + chunk(b'IEND', b'')


def pdf():
    stream = b'BT /F1 24 Tf 60 700 Td (Factory PDF sample) Tj ET\n'
    objects = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        b'<< /Length ' + str(len(stream)).encode() + b' >>\nstream\n' + stream + b'endstream',
    ]
    data = b'%PDF-1.4\n'
    offsets = [0]
    for i, obj in enumerate(objects, 1):
        offsets.append(len(data))
        data += f'{i} 0 obj\n'.encode() + obj + b'\nendobj\n'
    start = len(data)
    data += f'xref\n0 {len(offsets)}\n0000000000 65535 f \n'.encode()
    data += b''.join(f'{off:010d} 00000 n \n'.encode() for off in offsets[1:])
    return data + f'trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{start}\n%%EOF\n'.encode()


def docx():
    main = 'word/document.xml'
    return package({
        '_rels/.rels': rels([('rId1', 'officeDocument', main)]),
        main: XML + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Factory DOCX sample</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>',
    }, {main: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'})


def xlsx():
    ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
    return package({
        '_rels/.rels': rels([('rId1', 'officeDocument', 'xl/workbook.xml')]),
        'xl/workbook.xml': XML + f'<workbook xmlns="{ns}" xmlns:r="{OFFICE}"><sheets><sheet name="Sample" sheetId="1" r:id="rId1"/></sheets></workbook>',
        'xl/_rels/workbook.xml.rels': rels([('rId1', 'worksheet', 'worksheets/sheet1.xml')]),
        'xl/worksheets/sheet1.xml': XML + f'<worksheet xmlns="{ns}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Factory XLSX sample</t></is></c></row><row r="2"><c r="A2"><v>42</v></c></row></sheetData></worksheet>',
    }, {'xl/workbook.xml': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml', 'xl/worksheets/sheet1.xml': 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'})


def pptx():
    group = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
    cmap = '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
    colors = dict(dk1='000000', lt1='FFFFFF', dk2='44546A', lt2='E7E6E6', accent1='4472C4', accent2='ED7D31', accent3='A5A5A5', accent4='FFC000', accent5='5B9BD5', accent6='70AD47', hlink='0563C1', folHlink='954F72')
    solid = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'
    font = '<a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/>'
    theme = XML + f'<a:theme xmlns:a="{DRAW}" name="Factory"><a:themeElements><a:clrScheme name="Factory">' + ''.join(f'<a:{k}><a:srgbClr val="{v}"/></a:{k}>' for k, v in colors.items()) + '</a:clrScheme><a:fontScheme name="Factory"><a:majorFont>' + font + '</a:majorFont><a:minorFont>' + font + '</a:minorFont></a:fontScheme><a:fmtScheme name="Factory"><a:fillStyleLst>' + solid * 3 + '</a:fillStyleLst><a:lnStyleLst>' + ('<a:ln w="12700">' + solid + '<a:prstDash val="solid"/></a:ln>') * 3 + '</a:lnStyleLst><a:effectStyleLst>' + '<a:effectStyle><a:effectLst/></a:effectStyle>' * 3 + '</a:effectStyleLst><a:bgFillStyleLst>' + solid * 3 + '</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>'
    head = f'xmlns:a="{DRAW}" xmlns:p="{PRES}" xmlns:r="{OFFICE}"'
    shape = '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Sample title"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="10058400" cy="1828800"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="3200"><a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>Factory PPTX sample</a:t></a:r><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>'
    parts = {
        '_rels/.rels': rels([('rId1', 'officeDocument', 'ppt/presentation.xml')]),
        'ppt/presentation.xml': XML + f'<p:presentation {head}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>',
        'ppt/_rels/presentation.xml.rels': rels([('rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'), ('rId2', 'slide', 'slides/slide1.xml')]),
        'ppt/slides/slide1.xml': XML + f'<p:sld {head}><p:cSld><p:spTree>{group}{shape}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>',
        'ppt/slides/_rels/slide1.xml.rels': rels([('rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml')]),
        'ppt/slideLayouts/slideLayout1.xml': XML + f'<p:sldLayout {head} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>{group}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>',
        'ppt/slideLayouts/_rels/slideLayout1.xml.rels': rels([('rId1', 'slideMaster', '../slideMasters/slideMaster1.xml')]),
        'ppt/slideMasters/slideMaster1.xml': XML + f'<p:sldMaster {head}><p:cSld><p:spTree>{group}</p:spTree></p:cSld>{cmap}<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>',
        'ppt/slideMasters/_rels/slideMaster1.xml.rels': rels([('rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'), ('rId2', 'theme', '../theme/theme1.xml')]),
        'ppt/theme/theme1.xml': theme,
    }
    mime = 'application/vnd.openxmlformats-officedocument.'
    overrides = {name: mime + kind for name, kind in {
        'ppt/presentation.xml': 'presentationml.presentation.main+xml',
        'ppt/slides/slide1.xml': 'presentationml.slide+xml',
        'ppt/slideLayouts/slideLayout1.xml': 'presentationml.slideLayout+xml',
        'ppt/slideMasters/slideMaster1.xml': 'presentationml.slideMaster+xml',
        'ppt/theme/theme1.xml': 'theme+xml',
    }.items()}
    return package(parts, overrides)


def prepare(output):
    output.mkdir(parents=True, exist_ok=True)
    manifest = {'version': 1, 'files': []}
    for name, data, expected in [
        ('sample.png', png(), 'A solid blue square'),
        ('sample.pdf', pdf(), 'Factory PDF sample'),
        ('sample.docx', docx(), 'Factory DOCX sample'),
        ('sample.xlsx', xlsx(), 'Factory XLSX sample; A2 = 42'),
        ('sample.pptx', pptx(), 'Factory PPTX sample'),
        ('corrupt.png', b'This is not PNG image data.\n', 'Explicit failure feedback'),
        ('unsupported.exe', b'Factory unsupported plain-text test input.\n', 'Explicit unsupported-format feedback'),
    ]:
        (output / name).write_bytes(data)
        manifest['files'].append({'name': name, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data), 'expected': expected, 'valid': name.startswith('sample.')})
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return manifest


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: prepare-browser-fixtures.py <factory-fixture-directory>')
    prepare(Path(sys.argv[1]))
