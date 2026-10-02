/**
 * Errors a domain service raises when the request cannot be served.
 *
 * The service layer never returns an HTTP status itself; it names the condition in the domain's terms. A route maps
 * a `ServiceError` onto its response and lets anything else surface as an unexpected failure.
 */
export type ServiceErrorCode =
  'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_FAILED' | 'UNAVAILABLE';

export class ServiceError extends Error {
  public readonly status: number;
  public readonly code: ServiceErrorCode;

  public constructor(code: ServiceErrorCode, message: string, status: number) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.status = status;
  }
}

export function forbidden(
  message = 'You do not have permission to perform this operation.',
): ServiceError {
  return new ServiceError('FORBIDDEN', message, 403);
}

export function notFound(message = 'The record does not exist.'): ServiceError {
  return new ServiceError('NOT_FOUND', message, 404);
}

export function conflict(message: string): ServiceError {
  return new ServiceError('CONFLICT', message, 409);
}

export function invalid(message: string): ServiceError {
  return new ServiceError('VALIDATION_FAILED', message, 422);
}

export function unavailable(message: string): ServiceError {
  return new ServiceError('UNAVAILABLE', message, 503);
}

export function isServiceError(value: unknown): value is ServiceError {
  return value instanceof ServiceError;
}
