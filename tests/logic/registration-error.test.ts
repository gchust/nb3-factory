import { describe, expect, it } from 'vitest';

import { registrationErrorMessage } from '../../client/pages/auth/registration-error.js';

const translate = (key: string): string => key;

function authError(message: string, body?: unknown): Error {
  const error = new Error(message) as Error & { error?: unknown };
  if (body !== undefined) error.error = body;
  return error;
}

describe('registration error messages', () => {
  it('explains a taken username from the response body', () => {
    const error = authError('Bad Request', {
      code: 'USERNAME_IS_ALREADY_TAKEN',
      message: 'Username is already taken. Please try another.',
    });
    expect(registrationErrorMessage(error, translate)).toBe(
      'auth.usernameTaken',
    );
  });

  it('explains a taken email from the response body', () => {
    const error = authError('Unprocessable Entity', {
      code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
      message: 'User already exists. Use another email.',
    });
    expect(registrationErrorMessage(error, translate)).toBe('auth.emailTaken');
  });

  it('prefers a readable server message over the status text', () => {
    const error = authError('Bad Request', {
      message: 'Password is too short',
    });
    expect(registrationErrorMessage(error, translate)).toBe(
      'Password is too short',
    );
  });

  it('never surfaces a bare HTTP status text', () => {
    expect(registrationErrorMessage(authError('Bad Request'), translate)).toBe(
      'auth.registerFailed',
    );
    expect(registrationErrorMessage(undefined, translate)).toBe(
      'auth.registerFailed',
    );
  });
});
