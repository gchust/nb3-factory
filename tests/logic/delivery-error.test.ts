import { describe, expect, it } from 'vitest';

import { DeliveryApiError } from '@/lib/delivery-api';
import { deliveryErrorKey, rawErrorMessage } from '@/lib/delivery-error';

/**
 * Business failures arrive as a stable code plus an English message. The
 * interface wording is chosen by code, so these assertions keep the mapping
 * from silently losing a rule the server can still raise.
 */
describe('delivery error wording', () => {
  it('maps the business rule codes the API can return', () => {
    expect(deliveryErrorKey('OVERPAYMENT')).toBe('delivery.errors.OVERPAYMENT');
    expect(deliveryErrorKey('ALLOCATION_EXCEEDS_CONTRACT')).toBe(
      'delivery.errors.ALLOCATION_EXCEEDS_CONTRACT',
    );
    expect(deliveryErrorKey('REASON_REQUIRED')).toBe(
      'delivery.errors.REASON_REQUIRED',
    );
    expect(deliveryErrorKey('FORBIDDEN')).toBe('delivery.errors.FORBIDDEN');
  });

  it('leaves an unknown code to the server message', () => {
    expect(deliveryErrorKey('SOMETHING_NEW')).toBeUndefined();
  });

  it('keeps the server text when a failure is not a coded delivery error', () => {
    expect(rawErrorMessage(new Error('Network down'))).toBe('Network down');
    expect(
      rawErrorMessage(
        new DeliveryApiError(400, 'OVERPAYMENT', 'server wording'),
      ),
    ).toBe('server wording');
  });
});
