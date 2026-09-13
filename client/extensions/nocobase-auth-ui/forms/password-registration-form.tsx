import { usePasswordLogin } from '@nocobase/app-plugin-authentication/client/actions';
import { useState, type FormEvent, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { messageOf, useProcurementApi } from '@/lib/procurement-api';

import { FormStatus } from '../components/form-status';

/**
 * Registration is served by the application's own endpoint
 * (`POST /api/procurement/register`) rather than the Authentication plugin's
 * sign-up action. The plugin's action inserts a credential account without the
 * `issuer` its own schema requires, so self-registration fails; the
 * application endpoint creates the account through the plugin's public
 * user-administration contract, which sets it. The endpoint accepts no role, so
 * a new account only inherits the authenticated baseline.
 */
export function PasswordRegistrationForm(): ReactElement {
  const [confirmation, setConfirmation] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [validationError, setValidationError] = useState<string>();
  const [submitError, setSubmitError] = useState<string>();
  const [isPending, setIsPending] = useState(false);
  const api = useProcurementApi();
  const login = usePasswordLogin();
  const errorMessage = validationError ?? submitError ?? login.error?.message;

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (password !== confirmation) {
      setValidationError("Passwords don't match.");
      return;
    }
    setValidationError(undefined);
    setSubmitError(undefined);
    setIsPending(true);
    try {
      await api.register({ name, username, email, password });
      // Sign in with the new credentials so registration lands the user in the
      // application rather than bouncing back to the sign-in form.
      await login.submit({ identifier: username, password });
    } catch (cause) {
      setSubmitError(messageOf(cause));
    } finally {
      setIsPending(false);
    }
  };

  return (
    <form className='space-y-5' onSubmit={(event) => void handleSubmit(event)}>
      <div className='space-y-2'>
        <Label htmlFor='name'>Name</Label>
        <Input
          id='name'
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='username'>Username</Label>
        <Input
          id='username'
          autoComplete='username'
          onChange={(event) => setUsername(event.target.value)}
          required
          value={username}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='register-email'>Email</Label>
        <Input
          id='register-email'
          autoComplete='email'
          onChange={(event) => setEmail(event.target.value)}
          required
          type='email'
          value={email}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='register-password'>Password</Label>
        <Input
          id='register-password'
          autoComplete='new-password'
          onChange={(event) => setPassword(event.target.value)}
          required
          type='password'
          value={password}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='confirm-password'>Confirm password</Label>
        <Input
          id='confirm-password'
          autoComplete='new-password'
          onChange={(event) => setConfirmation(event.target.value)}
          required
          type='password'
          value={confirmation}
        />
      </div>
      {errorMessage ? (
        <FormStatus type='error'>{errorMessage}</FormStatus>
      ) : null}
      <Button className='w-full' disabled={isPending} type='submit'>
        {isPending ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  );
}
