// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { extractDocxText } from '../../client/extensions/nocobase-file-component-ui/lib/docx-text';
import { buildDocx, buildZip, documentPart } from '../fixtures/docx';

const SAMPLE_BODY = '<w:p><w:r><w:t>Factory DOCX sample</w:t></w:r></w:p>';

describe('extractDocxText', () => {
  it('reads the runs of a deflated document part', async () => {
    const archive = buildZip([
      { name: '[Content_Types].xml', content: '<Types />' },
      { name: 'word/document.xml', content: documentPart(SAMPLE_BODY) },
    ]);
    expect(await extractDocxText(archive)).toBe('Factory DOCX sample');
  });

  it('reads a stored document part as well as a deflated one', async () => {
    const archive = buildZip([
      {
        name: 'word/document.xml',
        content: documentPart(SAMPLE_BODY),
        method: 0,
      },
    ]);
    expect(await extractDocxText(archive)).toBe('Factory DOCX sample');
  });

  it('keeps paragraphs as lines and decodes XML entities', async () => {
    const archive = buildZip([
      {
        name: 'word/document.xml',
        content: documentPart(
          '<w:p><w:r><w:t>First &amp; &lt;one&gt;</w:t></w:r></w:p>' +
            '<w:p><w:r><w:t>Second&#33;</w:t></w:r></w:p>',
        ),
      },
    ]);
    expect(await extractDocxText(archive)).toBe('First & <one>\nSecond!');
  });

  it('turns a document without any text into undefined', async () => {
    const archive = buildZip([
      { name: 'word/document.xml', content: documentPart('<w:p />') },
    ]);
    expect(await extractDocxText(archive)).toBeUndefined();
  });

  it('returns undefined rather than throwing for a damaged archive', async () => {
    const damaged = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    expect(await extractDocxText(damaged.buffer)).toBeUndefined();
  });

  it('returns undefined when the document part is absent', async () => {
    const archive = buildZip([
      { name: 'word/styles.xml', content: '<w:styles />' },
    ]);
    expect(await extractDocxText(archive)).toBeUndefined();
  });

  it('reads the text of a fixture built for the browser tests', async () => {
    expect(await extractDocxText(buildDocx('Factory DOCX sample'))).toBe(
      'Factory DOCX sample',
    );
  });
});
