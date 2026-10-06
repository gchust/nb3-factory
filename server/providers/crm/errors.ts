/**
 * Domain errors for the CRM service.
 *
 * The HTTP layer translates the code into a status and returns `{ code, field,
 * message }`, and the client form maps the code back to a localized message, so
 * the code is part of the contract and the English `message` is a fallback for
 * logs rather than something a user should read.
 */
export type CrmErrorCode =
  | 'INVALID_BODY'
  | 'VALIDATION'
  | 'NAME_REQUIRED'
  | 'NAME_TAKEN'
  | 'CUSTOMER_REQUIRED'
  | 'CUSTOMER_NOT_FOUND'
  | 'AMOUNT_INVALID'
  | 'STAGE_INVALID'
  | 'NOT_FOUND';

const MESSAGES: Record<CrmErrorCode, string> = {
  INVALID_BODY: 'The request body must be a JSON object.',
  VALIDATION: 'The value has the wrong type or format.',
  NAME_REQUIRED: 'A name is required.',
  NAME_TAKEN: 'A record with this name already exists.',
  CUSTOMER_REQUIRED: 'A customer is required.',
  CUSTOMER_NOT_FOUND: 'The selected customer does not exist.',
  AMOUNT_INVALID: 'The expected amount must be a number of at least 0.',
  STAGE_INVALID: 'The stage is not one of the supported values.',
  NOT_FOUND: 'The record does not exist.',
};

export class CrmError extends Error {
  public readonly code: CrmErrorCode;

  /** Which input field the error belongs to, so the form can show it in place. */
  public readonly field?: string;

  public constructor(code: CrmErrorCode, field?: string) {
    super(MESSAGES[code]);
    this.name = 'CrmError';
    this.code = code;
    this.field = field;
  }
}
