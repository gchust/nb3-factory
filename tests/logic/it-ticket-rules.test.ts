// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  canTransition,
  isItTransition,
  isTerminalStatus,
  IT_CATEGORIES,
  IT_DESCRIPTION_MAX_LENGTH,
  IT_RESOLUTION_MAX_LENGTH,
  IT_TITLE_MAX_LENGTH,
  validateResolution,
  validateTicketDraft,
} from '../../server/it/rules.js';

describe('IT ticket submission rules', () => {
  it('accepts a complete submission and trims its text', () => {
    const result = validateTicketDraft({
      title: '  Laptop will not power on  ',
      category: 'computer',
      description: '  It stopped this morning.  ',
    });
    expect(result).toEqual({
      ok: true,
      value: {
        title: 'Laptop will not power on',
        category: 'computer',
        description: 'It stopped this morning.',
      },
    });
  });

  it('treats an empty description as optional', () => {
    expect(validateTicketDraft({ title: 'Help', category: 'other' })).toEqual({
      ok: true,
      value: { title: 'Help', category: 'other', description: '' },
    });
    expect(
      validateTicketDraft({
        title: 'Help',
        category: 'other',
        description: null,
      }),
    ).toEqual({
      ok: true,
      value: { title: 'Help', category: 'other', description: '' },
    });
  });

  it('requires a non-blank title', () => {
    expect(validateTicketDraft({ title: '   ', category: 'computer' })).toEqual(
      {
        ok: false,
        reason: 'TITLE_REQUIRED',
      },
    );
    expect(validateTicketDraft({ category: 'computer' })).toEqual({
      ok: false,
      reason: 'TITLE_REQUIRED',
    });
  });

  it('rejects a title longer than the limit after trimming', () => {
    const title = 'a'.repeat(IT_TITLE_MAX_LENGTH);
    expect(validateTicketDraft({ title, category: 'computer' }).ok).toBe(true);
    expect(
      validateTicketDraft({ title: `${title}b`, category: 'computer' }),
    ).toEqual({ ok: false, reason: 'TITLE_TOO_LONG' });
  });

  it('requires a known category', () => {
    expect(validateTicketDraft({ title: 'Help' })).toEqual({
      ok: false,
      reason: 'CATEGORY_REQUIRED',
    });
    expect(validateTicketDraft({ title: 'Help', category: 'printer' })).toEqual(
      { ok: false, reason: 'CATEGORY_INVALID' },
    );
    for (const category of IT_CATEGORIES) {
      expect(validateTicketDraft({ title: 'Help', category }).ok).toBe(true);
    }
  });

  it('rejects a description longer than the limit', () => {
    expect(
      validateTicketDraft({
        title: 'Help',
        category: 'other',
        description: 'a'.repeat(IT_DESCRIPTION_MAX_LENGTH + 1),
      }),
    ).toEqual({ ok: false, reason: 'DESCRIPTION_TOO_LONG' });
  });
});

describe('IT ticket lifecycle', () => {
  it('only starts a pending ticket', () => {
    expect(canTransition('pending', 'start')).toBe(true);
    expect(canTransition('pending', 'complete')).toBe(false);
  });

  it('only completes a ticket that is being handled', () => {
    expect(canTransition('processing', 'complete')).toBe(true);
    expect(canTransition('processing', 'start')).toBe(false);
  });

  it('treats a completed ticket as terminal', () => {
    // Completed tickets cannot be modified or completed twice.
    expect(canTransition('completed', 'start')).toBe(false);
    expect(canTransition('completed', 'complete')).toBe(false);
    expect(isTerminalStatus('completed')).toBe(true);
    expect(isTerminalStatus('pending')).toBe(false);
    expect(isTerminalStatus('processing')).toBe(false);
  });

  it('refuses any transition from an unknown status', () => {
    expect(canTransition(undefined, 'start')).toBe(false);
    expect(canTransition('archived', 'complete')).toBe(false);
  });

  it('recognizes only the declared transitions', () => {
    expect(isItTransition('start')).toBe(true);
    expect(isItTransition('complete')).toBe(true);
    expect(isItTransition('cancel')).toBe(false);
    expect(isItTransition(undefined)).toBe(false);
    expect(isItTransition(42)).toBe(false);
  });
});

describe('IT ticket resolution', () => {
  it('requires a non-blank resolution and trims it', () => {
    expect(validateResolution('  Replaced the power supply.  ')).toEqual({
      ok: true,
      value: 'Replaced the power supply.',
    });
    expect(validateResolution('   ')).toEqual({
      ok: false,
      reason: 'RESOLUTION_REQUIRED',
    });
    expect(validateResolution(undefined)).toEqual({
      ok: false,
      reason: 'RESOLUTION_REQUIRED',
    });
  });

  it('rejects a resolution longer than the limit', () => {
    expect(validateResolution('a'.repeat(IT_RESOLUTION_MAX_LENGTH)).ok).toBe(
      true,
    );
    expect(
      validateResolution('a'.repeat(IT_RESOLUTION_MAX_LENGTH + 1)),
    ).toEqual({ ok: false, reason: 'RESOLUTION_TOO_LONG' });
  });
});
