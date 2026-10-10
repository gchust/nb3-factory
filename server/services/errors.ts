import type { ApiErrorStatus } from '@nocobase/app-server/router';

/**
 * A domain failure raised by a business service.
 *
 * Services do not know about HTTP. They report the canonical error status,
 * a stable machine-readable reason and a developer-facing message, and the
 * route translates that into the standard `/api` error body. `status` uses the
 * same AIP-193 names `ApiError` does, so no mapping table is needed.
 */
export class ServiceError extends Error {
  public readonly status: ApiErrorStatus;
  public readonly reason: string;

  constructor(status: ApiErrorStatus, reason: string, message: string) {
    super(message);
    this.name = 'ServiceError';
    this.status = status;
    this.reason = reason;
  }
}

export function notFound(reason: string, message: string): ServiceError {
  return new ServiceError('NOT_FOUND', reason, message);
}

export function conflict(reason: string, message: string): ServiceError {
  return new ServiceError('FAILED_PRECONDITION', reason, message);
}

export function invalid(reason: string, message: string): ServiceError {
  return new ServiceError('INVALID_ARGUMENT', reason, message);
}

export function denied(reason: string, message: string): ServiceError {
  return new ServiceError('PERMISSION_DENIED', reason, message);
}

export function unavailable(reason: string, message: string): ServiceError {
  return new ServiceError('UNAVAILABLE', reason, message);
}
