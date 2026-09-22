import type { FieldVisitDraft } from './api.js';

/** Kept in step with the server's `customerName` length on purpose. */
export const MAX_CUSTOMER_NAME_LENGTH = 64;

export type FieldVisitFieldErrors = Partial<
  Record<'customerName' | 'visitDate' | 'conclusion', string>
>;

/**
 * Validates before saving. The values are translation keys, so the form renders them in the active language and the
 * same function can be unit tested without mounting the form.
 */
export function validateFieldVisitDraft(
  draft: FieldVisitDraft,
): FieldVisitFieldErrors {
  const errors: FieldVisitFieldErrors = {};

  const customerName = draft.customerName.trim();
  if (!customerName) {
    errors.customerName = 'fieldVisits.validation.customerNameRequired';
  } else if (customerName.length > MAX_CUSTOMER_NAME_LENGTH) {
    errors.customerName = 'fieldVisits.validation.customerNameTooLong';
  }

  if (!draft.visitDate.trim()) {
    errors.visitDate = 'fieldVisits.validation.visitDateRequired';
  }

  if (!draft.conclusion) {
    errors.conclusion = 'fieldVisits.validation.conclusionRequired';
  }

  return errors;
}
