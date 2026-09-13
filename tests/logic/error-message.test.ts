import { describe, expect, it } from 'vitest';

import { employeeErrorMessage } from '@/components/employee-records/error-message';

const t = (key: string): string => key;

function errorWithCode(code: string): Error {
  const error = new Error('request failed');
  Object.assign(error, { code });
  return error;
}

describe('employeeErrorMessage', () => {
  it('maps stable server codes to their translated message', () => {
    expect(employeeErrorMessage(t, errorWithCode('EMPLOYEE_NO_TAKEN'))).toBe(
      'employees.errors.employeeNoTaken',
    );
    expect(employeeErrorMessage(t, errorWithCode('INVALID_INPUT'))).toBe(
      'employees.errors.invalidInput',
    );
    expect(employeeErrorMessage(t, errorWithCode('NOT_FOUND'))).toBe(
      'employees.errors.notFound',
    );
  });

  it('falls back to a generic message', () => {
    expect(employeeErrorMessage(t, new Error('boom'))).toBe(
      'employees.errors.generic',
    );
    expect(employeeErrorMessage(t, 'not an error')).toBe(
      'employees.errors.generic',
    );
  });
});
