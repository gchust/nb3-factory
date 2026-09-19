const HTTP_STATUS_TEXTS = new Set([
  'Bad Request',
  'Unauthorized',
  'Forbidden',
  'Not Found',
  'Method Not Allowed',
  'Conflict',
  'Unprocessable Entity',
  'Too Many Requests',
  'Internal Server Error',
  'Bad Gateway',
  'Service Unavailable',
]);

/**
 * Turn an authentication failure into a readable, localized message.
 *
 * Better Auth puts the real explanation in the response body, but the thrown
 * error's `message` is only the HTTP status text ("Bad Request"), so the body
 * is inspected first and known error codes are mapped to translation keys.
 */
export function registrationErrorMessage(
  cause: unknown,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const body = errorBody(cause);
  const code = typeof body?.code === 'string' ? body.code : '';
  const serverMessage = typeof body?.message === 'string' ? body.message : '';
  if (code === 'USERNAME_IS_ALREADY_TAKEN') {
    return t('auth.usernameTaken');
  }
  if (
    code === 'USER_ALREADY_EXISTS' ||
    code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'
  ) {
    return t('auth.emailTaken');
  }
  if (code === 'PASSWORD_TOO_SHORT') return t('auth.passwordTooShort');
  if (code === 'PASSWORD_TOO_LONG') return t('auth.passwordTooLong');
  if (code === 'INVALID_EMAIL') return t('auth.invalidEmail');
  if (serverMessage && !isHttpStatusText(serverMessage)) {
    return serverMessage;
  }
  const message = cause instanceof Error ? cause.message : '';
  if (message && !isHttpStatusText(message)) return message;
  return t('auth.registerFailed');
}

function errorBody(
  cause: unknown,
): { readonly code?: unknown; readonly message?: unknown } | undefined {
  if (typeof cause !== 'object' || cause === null) return undefined;
  const record = cause as Record<string, unknown>;
  for (const key of ['error', 'body', 'data']) {
    const value = record[key];
    if (typeof value === 'object' && value !== null) {
      return value;
    }
  }
  return record;
}

function isHttpStatusText(message: string): boolean {
  return HTTP_STATUS_TEXTS.has(message);
}
