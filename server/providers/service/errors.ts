/**
 * Domain errors raised by the after-sales service operations.
 *
 * Routes translate these into HTTP responses; domain code never talks HTTP.
 */
export class ServiceError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ServiceError';
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (
  message: string,
  code = 'BAD_REQUEST',
): ServiceError => new ServiceError(400, code, message);

export const unauthorized = (message: string): ServiceError =>
  new ServiceError(401, 'UNAUTHORIZED', message);

export const forbidden = (message: string): ServiceError =>
  new ServiceError(403, 'FORBIDDEN', message);

export const notFound = (message: string, code = 'NOT_FOUND'): ServiceError =>
  new ServiceError(404, code, message);

export const conflict = (message: string, code = 'CONFLICT'): ServiceError =>
  new ServiceError(409, code, message);
