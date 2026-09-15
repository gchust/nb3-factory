import { describe, expect, it } from 'vitest';

import {
  canonicalMimeType,
  classifyMediaFile,
  fileExtension,
  normalizeSize,
  normalizeTags,
  tagsFromStored,
} from '../../server/media/allowed-types.js';

describe('classifyMediaFile', () => {
  it.each([
    ['photo.png', 'image/png', 'image'],
    ['photo.JPG', 'image/jpeg', 'image'],
    ['photo.jpeg', 'image/jpeg', 'image'],
    ['anim.gif', 'image/gif', 'image'],
    ['shot.webp', 'image/webp', 'image'],
    ['song.mp3', 'audio/mpeg', 'audio'],
    ['song.wav', 'audio/wav', 'audio'],
    ['clip.mp4', 'video/mp4', 'video'],
    ['clip.webm', 'video/webm', 'video'],
    ['doc.pdf', 'application/pdf', 'document'],
    ['notes.txt', 'text/plain', 'document'],
    ['readme.md', 'text/markdown', 'document'],
  ])('accepts %s as %s', (filename, mimeType, type) => {
    const result = classifyMediaFile(filename, mimeType);
    expect(result).toEqual({ ok: true, type, ext: fileExtension(filename) });
  });

  it.each([
    'page.html',
    'page.htm',
    'vector.svg',
    'data.xml',
    'sheet.xhtml',
    'archive.zip',
    'program.exe',
    'script.js',
    'noextension',
  ])('refuses %s', (filename) => {
    const result = classifyMediaFile(filename, '');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('TYPE_NOT_ALLOWED');
  });

  it('refuses an allowed extension announced as active markup', () => {
    const result = classifyMediaFile('photo.png', 'text/html');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('MIME_NOT_ALLOWED');
  });

  it('accepts an empty declared type and lets the extension decide', () => {
    expect(classifyMediaFile('readme.md', '')).toEqual({
      ok: true,
      type: 'document',
      ext: 'md',
    });
  });
});

describe('canonicalMimeType', () => {
  it('maps each accepted extension to a concrete content type', () => {
    expect(canonicalMimeType('md')).toBe('text/markdown');
    expect(canonicalMimeType('txt')).toBe('text/plain');
    expect(canonicalMimeType('mp3')).toBe('audio/mpeg');
    expect(canonicalMimeType('unknown')).toBe('application/octet-stream');
  });
});

describe('tags', () => {
  it('normalises to a delimited, de-duplicated list', () => {
    expect(normalizeTags('Launch, marketing , LAUNCH')).toBe(
      ',Launch,marketing,',
    );
    expect(normalizeTags(['a', ' a ', 'b'])).toBe(',a,b,');
    expect(normalizeTags('')).toBeNull();
    expect(normalizeTags([])).toBeNull();
  });

  it('reads the stored form back', () => {
    expect(tagsFromStored(',alpha,beta,')).toEqual(['alpha', 'beta']);
    expect(tagsFromStored(null)).toEqual([]);
  });
});

describe('normalizeSize', () => {
  it('accepts numbers, bigints and digit strings', () => {
    expect(normalizeSize(12)).toBe(12);
    expect(normalizeSize(12n)).toBe(12);
    expect(normalizeSize('34')).toBe(34);
    expect(normalizeSize(-1)).toBe(0);
    expect(normalizeSize(undefined)).toBe(0);
  });
});
