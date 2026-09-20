/** A business failure that the HTTP layer maps to a status code and a stable code. */
export class DeliveryError extends Error {
  public readonly code: string;
  public readonly status: 400 | 401 | 403 | 404 | 409;

  constructor(
    status: 400 | 401 | 403 | 404 | 409,
    code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DeliveryError';
    this.status = status;
    this.code = code;
  }
}

export function badRequest(code: string, message: string): DeliveryError {
  return new DeliveryError(400, code, message);
}

export function forbidden(message = 'Forbidden'): DeliveryError {
  return new DeliveryError(403, 'FORBIDDEN', message);
}

export function notFound(message = 'Not found'): DeliveryError {
  return new DeliveryError(404, 'NOT_FOUND', message);
}

export function conflict(code: string, message: string): DeliveryError {
  return new DeliveryError(409, code, message);
}
