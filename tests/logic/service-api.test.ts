import { describe, expect, it } from 'vitest';

import { serviceErrorMessage } from '../../client/pages/service/lib/api.js';

describe('service error messages', () => {
  it('reads the NocoBase errors envelope the routes answer with', () => {
    const error = {
      payload: {
        errors: [{ message: 'Device code already exists', code: 409 }],
      },
    };
    expect(serviceErrorMessage(error)).toBe('Device code already exists');
  });

  it('accepts a single error object and a plain message field', () => {
    expect(
      serviceErrorMessage({ payload: { error: { message: 'Forbidden' } } }),
    ).toBe('Forbidden');
    expect(serviceErrorMessage({ payload: { message: 'Not found' } })).toBe(
      'Not found',
    );
  });

  it('falls back to the thrown error and a bare value', () => {
    expect(serviceErrorMessage(new Error('API request failed (500)'))).toBe(
      'API request failed (500)',
    );
    expect(serviceErrorMessage('boom')).toBe('boom');
  });
});
