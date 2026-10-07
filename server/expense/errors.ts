/**
 * Failures the expense workflow can produce, stated in domain terms.
 *
 * The service throws these; the routes translate one into an `ApiError` with the matching HTTP status. Keeping the
 * translation in the route is what lets the service stay free of HTTP concepts.
 */
export type ExpenseReason =
  | 'not_found'
  | 'forbidden'
  | 'invalid_status'
  | 'validation'
  | 'comment_required'
  | 'empty_claim'
  | 'invalid_payment_method'
  | 'conflict';

export class ExpenseError extends Error {
  readonly reason: ExpenseReason;
  readonly details?: Record<string, unknown>;

  constructor(
    reason: ExpenseReason,
    message?: string,
    details?: Record<string, unknown>,
  ) {
    super(message ?? reason);
    this.name = 'ExpenseError';
    this.reason = reason;
    this.details = details;
  }
}
