import { describe, expect, it, vi } from 'vitest';

/**
 * `qualityErrorKey` narrows on `ApiClientError`, so the test needs an instance
 * of the same class the module under test imports. The real export pulls in the
 * whole client runtime; a minimal stand-in with the same shape is enough.
 */
const { ApiClientError } = vi.hoisted(() => {
  class ApiClientError extends Error {
    readonly status: number;
    readonly payload: unknown;
    readonly code?: string;

    constructor(
      message: string,
      options: { status: number; payload?: unknown; code?: string },
    ) {
      super(message);
      this.status = options.status;
      this.payload = options.payload;
      this.code = options.code;
    }
  }
  return { ApiClientError };
});

vi.mock('@nocobase/app-client', () => ({
  ApiClientError,
  useApiClient: () => ({ request: vi.fn() }),
}));

import {
  fieldErrorMessages,
  qualityErrorKey,
  qualityErrorText,
  validateBatchDraft,
  validateHandlingDraft,
  validateItemDraft,
  validateProductDraft,
  validateReviewDraft,
  validateTaskDraft,
} from '../../client/components/quality/lib.js';

const translate = (key: string): string => `t:${key}`;

describe('quality draft validation', () => {
  it('reports every missing required field of a new inspection task', () => {
    const errors = validateTaskDraft({
      batchId: '',
      inspectorId: '',
      assignedLeadId: '',
      sampleSize: '10',
      items: [{ key: 'a', name: '  ' }],
    });

    expect(errors.map((entry) => entry.key)).toEqual([
      'quality.validation.batchRequired',
      'quality.validation.inspectorRequired',
      'quality.validation.leadRequired',
      'quality.validation.itemNameRequired',
    ]);
    expect(errors.at(-1)?.field).toBe('item:a');
  });

  it('accepts a complete inspection task draft', () => {
    expect(
      validateTaskDraft({
        batchId: 'b1',
        inspectorId: 'i1',
        assignedLeadId: 'l1',
        sampleSize: '12',
        items: [{ key: 'a', name: '外观' }],
      }),
    ).toEqual([]);
  });

  it('rejects a sample size that is not a positive integer', () => {
    for (const sampleSize of ['', '0', '1.5', 'abc']) {
      expect(
        validateTaskDraft({
          batchId: 'b1',
          inspectorId: 'i1',
          assignedLeadId: 'l1',
          sampleSize,
          items: [{ key: 'a', name: '外观' }],
        }).map((entry) => entry.field),
      ).toContain('sampleSize');
    }
  });

  it('requires product, batch number, quantity and production date', () => {
    expect(
      validateBatchDraft({
        productId: '',
        batchNo: '',
        quantity: '-1',
        producedAt: '',
      }).map((entry) => entry.field),
    ).toEqual(['productId', 'batchNo', 'quantity', 'producedAt']);
  });

  it('requires a product code, name and unit', () => {
    expect(
      validateProductDraft({ code: ' ', name: '', unit: '' }).map(
        (entry) => entry.field,
      ),
    ).toEqual(['code', 'name', 'unit']);
  });

  it('requires a cause and a corrective action before handling', () => {
    expect(
      validateHandlingDraft({ reason: '', measure: 'x' }).map((e) => e.field),
    ).toEqual(['reason']);
    expect(validateHandlingDraft({ reason: 'x', measure: 'y' })).toEqual([]);
  });

  it('only requires a comment when returning a nonconformance', () => {
    expect(validateReviewDraft('close', '')).toEqual([]);
    expect(validateReviewDraft('return', '   ')).toEqual([
      { field: 'comment', key: 'quality.validation.returnCommentRequired' },
    ]);
    expect(validateReviewDraft('return', '补充验证记录')).toEqual([]);
  });

  it('requires a remark only for an unqualified item', () => {
    expect(
      validateItemDraft({ result: '', remark: '' }).map((e) => e.field),
    ).toEqual(['result']);
    expect(validateItemDraft({ result: 'qualified', remark: '' })).toEqual([]);
    expect(
      validateItemDraft({ result: 'unqualified', remark: ' ' }).map(
        (e) => e.field,
      ),
    ).toEqual(['remark']);
    expect(
      validateItemDraft({ result: 'unqualified', remark: '有划痕' }),
    ).toEqual([]);
  });

  it('renders each error against its own field', () => {
    const messages = fieldErrorMessages(
      [
        { field: 'batchId', key: 'quality.validation.batchRequired' },
        { field: 'item:a', key: 'quality.validation.itemNameRequired' },
      ],
      translate,
    );

    expect(messages).toEqual({
      batchId: 't:quality.validation.batchRequired',
      'item:a': 't:quality.validation.itemNameRequired',
    });
  });
});

describe('quality server error localization', () => {
  it('maps a known validation message to its translated key', () => {
    const error = new ApiClientError(
      'Returning a nonconformance requires a comment.',
      {
        status: 400,
        payload: {
          code: 'VALIDATION',
          message: 'Returning a nonconformance requires a comment.',
        },
      },
    );

    expect(qualityErrorKey(error)).toBe(
      'quality.validation.returnCommentRequired',
    );
    expect(qualityErrorText(error, translate)).toBe(
      't:quality.validation.returnCommentRequired',
    );
  });

  it('falls back to the business code for an unrecognized message', () => {
    const error = new ApiClientError('Batch number already exists.', {
      status: 409,
      payload: { code: 'CONFLICT', message: 'Batch number already exists.' },
    });

    expect(qualityErrorKey(error)).toBe('quality.error.batchNoExists');
  });

  it('localizes a bare conflict without leaking the English server text', () => {
    const error = new ApiClientError('Some server text.', {
      status: 409,
      payload: { code: 'CONFLICT', message: 'Some server text.' },
    });

    expect(qualityErrorText(error, translate)).toBe('t:quality.error.conflict');
  });

  it('returns the raw message when nothing is recognized, never swallowing it', () => {
    const error = new ApiClientError('Something unexpected.', {
      status: 500,
      payload: { code: 'WEIRD', message: 'Something unexpected.' },
    });

    expect(qualityErrorKey(error)).toBeUndefined();
    expect(qualityErrorText(error, translate)).toBe('Something unexpected.');
    expect(qualityErrorKey(new Error('not an api error'))).toBeUndefined();
  });
});
