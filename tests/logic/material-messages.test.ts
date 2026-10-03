import { ApiClientError } from '@nocobase/app-client';
import { describe, expect, it } from 'vitest';

import { materialErrorMessage } from '../../client/pages/materials/message.js';

/** The application's locale is unavailable in a unit test; echo the key instead. */
const t = ((key: string) => key) as Parameters<typeof materialErrorMessage>[1];

function apiError(body: unknown, status = 400): ApiClientError {
  return new ApiClientError('', {
    payload: body,
    status,
    method: 'POST',
    url: '/main/api/project-materials',
  });
}

describe('materialErrorMessage', () => {
  it('names the reason a save was refused', () => {
    expect(
      materialErrorMessage(
        apiError({
          code: 'TITLE_REQUIRED',
          message: 'A title is required before the material can be saved.',
        }),
        t,
      ),
    ).toBe('materials.titleRequired');
    expect(materialErrorMessage(apiError({ code: 'TITLE_TOO_LONG' }), t)).toBe(
      'materials.titleTooLong',
    );
    expect(
      materialErrorMessage(apiError({ code: 'ATTACHMENT_NOT_FOUND' }), t),
    ).toBe('materials.notFound');
    expect(materialErrorMessage(apiError({ code: 'BODY_TOO_LARGE' }), t)).toBe(
      'materials.uploadTooLarge',
    );
  });

  it('lifts a code out of the nested error body', () => {
    expect(
      materialErrorMessage(
        apiError({ error: { code: 'ATTACHMENT_IDS_INVALID' } }),
        t,
      ),
    ).toBe('materials.attachmentInvalid');
  });

  it('falls back to the server message for a code the application does not know', () => {
    expect(
      materialErrorMessage(
        apiError({
          code: 'SOMETHING_ELSE',
          message: 'Storage is unavailable.',
        }),
        t,
      ),
    ).toBe('Storage is unavailable.');
  });

  it('reports a network failure without pretending a cause it cannot see', () => {
    expect(materialErrorMessage(new Error('Failed to fetch'), t)).toBe(
      'Failed to fetch',
    );
  });
});
