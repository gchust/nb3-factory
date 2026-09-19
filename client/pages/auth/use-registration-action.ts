import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useState } from 'react';

import { registrationErrorMessage } from './registration-error.js';

export interface RegistrationInput {
  readonly email: string;
  readonly name: string;
  readonly password: string;
  readonly username: string;
}

export interface RegistrationAction {
  readonly error?: { readonly message: string };
  readonly isPending: boolean;
  readonly isSuccess: boolean;
  readonly submit: (input: RegistrationInput) => Promise<void>;
}

/**
 * Registration action for the application's register page.
 *
 * The plugin's default `usePasswordRegistration` keeps only `error.message`,
 * which for a Better Auth HTTP failure is the status text ("Bad Request") and
 * hides the server's explanation. This action reads the response body so the
 * user sees a localized reason (for example a taken username).
 */
export function useRegistrationAction(): RegistrationAction {
  const { t } = useTranslation();
  const { client, refresh } = useAuthentication();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string } | undefined>();
  const [isSuccess, setIsSuccess] = useState(false);

  const submit = useCallback(
    async (input: RegistrationInput) => {
      setPending(true);
      setError(undefined);
      setIsSuccess(false);
      try {
        await client.signUp.email(input, { throw: true });
        await refresh();
        setIsSuccess(true);
      } catch (cause) {
        setError({ message: registrationErrorMessage(cause, t) });
      } finally {
        setPending(false);
      }
    },
    [client, refresh, t],
  );

  return { isPending: pending, error, isSuccess, submit };
}
