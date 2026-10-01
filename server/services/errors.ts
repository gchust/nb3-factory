// Domain errors carry a stable code and an HTTP status so a route can map them without inspecting messages. A service
// never imports Hono and never returns a Response.
export class ServiceError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: unknown;

  public constructor(
    code: string,
    status: number,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function badRequest(message: string, details?: unknown): ServiceError {
  return new ServiceError('VALIDATION_FAILED', 400, message, details);
}

export function notFound(message: string): ServiceError {
  return new ServiceError('RECORD_NOT_FOUND', 404, message);
}

export function conflict(message: string, details?: unknown): ServiceError {
  return new ServiceError('STATE_CONFLICT', 409, message, details);
}

export function forbidden(message: string): ServiceError {
  return new ServiceError('FORBIDDEN', 403, message);
}

export function forbiddenUnless(condition: boolean, message: string): void {
  if (!condition) throw forbidden(message);
}
