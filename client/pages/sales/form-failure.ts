import { ApiClientError } from '@nocobase/app-client';

/** How a failed save should be presented, independent of the wording. */
export type SalesFailureKind =
  | 'sessionExpired'
  | 'nameTaken'
  | 'reference'
  | 'notFound'
  | 'forbidden'
  | 'failed';

export interface SalesFailure {
  readonly kind: SalesFailureKind;
  /** The form field the failure belongs to, when it belongs to one. */
  readonly field?: string;
}

/**
 * Classify a save failure so a form can put it in the right place: below the field it belongs to, at the top of the
 * form, or in place of the form (session ended, record gone). The wording is the form's job.
 */
export function classifySalesFailure(error: unknown): SalesFailure {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return { kind: 'sessionExpired' };
    if (error.status === 403) return { kind: 'forbidden' };
    if (error.status === 404) return { kind: 'notFound' };
    if (error.status === 409 && error.reason === 'CUSTOMER_NAME_TAKEN') {
      return { kind: 'nameTaken', field: 'name' };
    }
    if (error.status === 400 && error.reason === 'SALES_REFERENCE_NOT_FOUND') {
      return { kind: 'reference', field: 'customerId' };
    }
  }
  return { kind: 'failed' };
}
