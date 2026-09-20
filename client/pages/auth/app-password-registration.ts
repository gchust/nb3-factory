import { useApiClient } from '@nocobase/app-client';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';

import type { PasswordRegistrationAction } from '@/extensions/nocobase-auth-ui/forms/password-registration-form';

function messageOf(error: unknown): string {
  const candidate = error as {
    message?: unknown;
    payload?: { message?: unknown };
  };
  if (
    typeof candidate?.payload?.message === 'string' &&
    candidate.payload.message
  ) {
    return candidate.payload.message;
  }
  if (typeof candidate?.message === 'string' && candidate.message) {
    return candidate.message;
  }
  return 'The account could not be created.';
}

/**
 * Registration through the application's own endpoint.
 *
 * The authentication plugin's built-in sign-up writes a credential account
 * without the `issuer` its own schema requires, so this application creates the
 * account itself and keeps sign-in with the plugin.
 */
export function useAppPasswordRegistration(): PasswordRegistrationAction {
  const api = useApiClient();
  const navigate = useNavigate();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<{ message: string }>();

  const submit = useCallback(
    async (input: {
      readonly email: string;
      readonly name: string;
      readonly password: string;
      readonly username: string;
    }): Promise<void> => {
      setIsPending(true);
      setError(undefined);
      try {
        await api.request({
          path: 'delivery/register',
          method: 'POST',
          json: {
            name: input.name,
            username: input.username,
            email: input.email,
            password: input.password,
          },
        });
        void navigate('/login', { replace: true });
      } catch (cause) {
        setError({ message: messageOf(cause) });
      } finally {
        setIsPending(false);
      }
    },
    [api, navigate],
  );

  return { error, isPending, submit };
}
