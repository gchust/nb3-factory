/**
 * Maps an API failure to a translated message. The server returns stable codes, so the wording stays a client concern
 * and never depends on the server's language.
 *
 * The error is inspected structurally rather than with `instanceof` so this module stays independent of the HTTP
 * client implementation and works in an isolated test.
 */
export function employeeErrorMessage(
  t: (key: string) => string,
  error: unknown,
): string {
  if (error instanceof Error) {
    switch (readCode(error)) {
      case 'EMPLOYEE_NO_TAKEN':
        return t('employees.errors.employeeNoTaken');
      case 'INVALID_INPUT':
      case 'INVALID_JSON':
        return t('employees.errors.invalidInput');
      case 'NOT_FOUND':
      case 'INVALID_ID':
        return t('employees.errors.notFound');
      default:
        break;
    }
  }
  return t('employees.errors.generic');
}

function readCode(error: Error): string | undefined {
  const code = (error as { readonly code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}
