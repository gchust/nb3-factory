// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  assertCanComplete,
  assertCanStart,
  assertNotCompleted,
  isTicketCategory,
  isTicketStatus,
  ItTicketError,
  normalizeCategory,
  normalizeDescription,
  normalizeResolution,
  normalizeStatusFilter,
  normalizeTitle,
  TICKET_CATEGORIES,
  TICKET_DESCRIPTION_MAX_LENGTH,
  TICKET_RESOLUTION_MAX_LENGTH,
  TICKET_TITLE_MAX_LENGTH,
} from '../../server/it-tickets/domain.js';

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return error instanceof ItTicketError
      ? error.code
      : 'NOT_AN_IT_TICKET_ERROR';
  }
  return 'NO_ERROR';
}

describe('IT ticket categories and statuses', () => {
  it('accepts only the three declared categories', () => {
    expect(TICKET_CATEGORIES).toEqual(['computer', 'account', 'other']);
    expect(isTicketCategory('computer')).toBe(true);
    expect(isTicketCategory('account')).toBe(true);
    expect(isTicketCategory('other')).toBe(true);
    expect(isTicketCategory('network')).toBe(false);
    expect(isTicketCategory('')).toBe(false);
  });

  it('accepts only the three declared statuses', () => {
    expect(isTicketStatus('pending')).toBe(true);
    expect(isTicketStatus('in_progress')).toBe(true);
    expect(isTicketStatus('completed')).toBe(true);
    expect(isTicketStatus('closed')).toBe(false);
  });
});

describe('ticket field normalization', () => {
  it('trims a title and rejects an empty or oversized one', () => {
    expect(normalizeTitle('  Screen is black  ')).toBe('Screen is black');
    expect(codeOf(() => normalizeTitle('   '))).toBe('INVALID_TITLE');
    expect(codeOf(() => normalizeTitle(undefined))).toBe('INVALID_TITLE');
    expect(
      codeOf(() => normalizeTitle('x'.repeat(TICKET_TITLE_MAX_LENGTH + 1))),
    ).toBe('INVALID_TITLE');
    expect(normalizeTitle('x'.repeat(TICKET_TITLE_MAX_LENGTH))).toHaveLength(
      TICKET_TITLE_MAX_LENGTH,
    );
  });

  it('requires a category from the declared set', () => {
    expect(normalizeCategory('account')).toBe('account');
    expect(codeOf(() => normalizeCategory('network'))).toBe('INVALID_CATEGORY');
    expect(codeOf(() => normalizeCategory(null))).toBe('INVALID_CATEGORY');
  });

  it('requires a non-empty description and enforces its length', () => {
    expect(normalizeDescription('  The fan is loud  ')).toBe('The fan is loud');
    expect(codeOf(() => normalizeDescription('  '))).toBe(
      'INVALID_DESCRIPTION',
    );
    expect(
      codeOf(() =>
        normalizeDescription('x'.repeat(TICKET_DESCRIPTION_MAX_LENGTH + 1)),
      ),
    ).toBe('INVALID_DESCRIPTION');
  });

  it('requires a handling note before completion', () => {
    expect(normalizeResolution(' Replaced the fan ')).toBe('Replaced the fan');
    expect(codeOf(() => normalizeResolution(''))).toBe('INVALID_RESOLUTION');
    expect(codeOf(() => normalizeResolution(undefined))).toBe(
      'INVALID_RESOLUTION',
    );
    expect(
      codeOf(() =>
        normalizeResolution('x'.repeat(TICKET_RESOLUTION_MAX_LENGTH + 1)),
      ),
    ).toBe('INVALID_RESOLUTION');
  });

  it('treats an absent status filter as every status and rejects an unknown one', () => {
    expect(normalizeStatusFilter(undefined)).toBeUndefined();
    expect(normalizeStatusFilter('')).toBeUndefined();
    expect(normalizeStatusFilter('pending')).toBe('pending');
    expect(codeOf(() => normalizeStatusFilter('closed'))).toBe(
      'INVALID_FILTER',
    );
  });
});

describe('ticket lifecycle rules', () => {
  it('only lets a pending ticket start', () => {
    expect(() => assertCanStart({ status: 'pending' })).not.toThrow();
    expect(codeOf(() => assertCanStart({ status: 'in_progress' }))).toBe(
      'INVALID_TRANSITION',
    );
    expect(codeOf(() => assertCanStart({ status: 'completed' }))).toBe(
      'TICKET_COMPLETED',
    );
  });

  it('only lets a ticket in progress complete', () => {
    expect(() => assertCanComplete({ status: 'in_progress' })).not.toThrow();
    expect(codeOf(() => assertCanComplete({ status: 'pending' }))).toBe(
      'INVALID_TRANSITION',
    );
    expect(codeOf(() => assertCanComplete({ status: 'completed' }))).toBe(
      'TICKET_COMPLETED',
    );
  });

  it('treats a completed ticket as final', () => {
    expect(() => assertNotCompleted({ status: 'in_progress' })).not.toThrow();
    expect(codeOf(() => assertNotCompleted({ status: 'completed' }))).toBe(
      'TICKET_COMPLETED',
    );
  });
});
