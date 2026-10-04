/**
 * Domain errors raised by the service layer. Routes translate them into HTTP
 * responses; services never decide a status code themselves.
 */
export class ServiceValidationError extends Error {
  public readonly fields: Readonly<Record<string, string>>;
  constructor(message: string, fields: Readonly<Record<string, string>> = {}) {
    super(message);
    this.name = 'ServiceValidationError';
    this.fields = fields;
  }
}

export class ServiceNotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'ServiceNotFoundError';
  }
}

export class ServiceConflictError extends Error {
  constructor(message = 'Conflict') {
    super(message);
    this.name = 'ServiceConflictError';
  }
}

export class ServiceForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ServiceForbiddenError';
  }
}
