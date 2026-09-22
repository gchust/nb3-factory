import { describe, expect, it } from 'vitest';

import {
  createEmptyFieldVisitDraft,
  toFieldVisitDraft,
  type FieldVisit,
} from '../../client/pages/field-visits/api.js';
import {
  MAX_CUSTOMER_NAME_LENGTH,
  validateFieldVisitDraft,
} from '../../client/pages/field-visits/validation.js';

const VALID_DRAFT = {
  customerName: 'Acme',
  visitDate: '2026-09-01',
  conclusion: 'satisfied',
  engineerName: '',
  notes: '',
} as const;

describe('field visit draft validation', () => {
  it('requires customer name, visit date and conclusion', () => {
    expect(validateFieldVisitDraft(createEmptyFieldVisitDraft())).toEqual({
      customerName: 'fieldVisits.validation.customerNameRequired',
      visitDate: 'fieldVisits.validation.visitDateRequired',
      conclusion: 'fieldVisits.validation.conclusionRequired',
    });
  });

  it('treats a whitespace-only customer name as empty', () => {
    expect(
      validateFieldVisitDraft({ ...VALID_DRAFT, customerName: '   ' }),
    ).toEqual({ customerName: 'fieldVisits.validation.customerNameRequired' });
  });

  it('rejects a customer name longer than the column allows', () => {
    const errors = validateFieldVisitDraft({
      ...VALID_DRAFT,
      customerName: 'x'.repeat(MAX_CUSTOMER_NAME_LENGTH + 1),
    });
    expect(errors).toEqual({
      customerName: 'fieldVisits.validation.customerNameTooLong',
    });
  });

  it('accepts a complete draft', () => {
    expect(validateFieldVisitDraft(VALID_DRAFT)).toEqual({});
  });
});

describe('field visit draft mapping', () => {
  it('starts empty for a new record', () => {
    expect(toFieldVisitDraft(null)).toEqual(createEmptyFieldVisitDraft());
  });

  it('replaces null optionals with empty strings for the form', () => {
    const record: FieldVisit = {
      id: 1,
      customerName: 'Acme',
      visitDate: '2026-09-01',
      conclusion: 'neutral',
      engineerName: null,
      notes: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    };
    expect(toFieldVisitDraft(record)).toEqual({
      customerName: 'Acme',
      visitDate: '2026-09-01',
      conclusion: 'neutral',
      engineerName: '',
      notes: '',
    });
  });
});
