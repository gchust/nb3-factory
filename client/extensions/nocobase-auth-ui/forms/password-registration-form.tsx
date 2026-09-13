import {
  apiClientToken,
  ApiClientError,
  useService,
} from '@nocobase/app-client';
import { useLogin } from '@refinedev/core';
import { useState, type FormEvent, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { FormStatus } from '../components/form-status';

/**
 * Account creation for the expense application.
 *
 * The application's own `register` endpoint creates the credential account through the Authentication-owned
 * user administration service, which sets the account issuer the schema requires. On success the visitor is signed in
 * with the credentials they just chose, so the Sign up flow ends authenticated rather than back on the sign-in page.
 */
export function PasswordRegistrationForm(): ReactElement {
  const api = useService(apiClientToken);
  const login = useLogin();
  const [confirmation, setConfirmation] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [validationError, setValidationError] = useState<string>();
  const [pending, setPending] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (password !== confirmation) {
      setValidationError("Passwords don't match.");
      return;
    }
    setValidationError(undefined);
    setPending(true);
    void (async () => {
      try {
        await api.request({
          path: 'register',
          method: 'POST',
          json: { name, username, email, password },
        });
        await login.mutateAsync({ identifier: username || email, password });
      } catch (cause) {
        setValidationError(registrationError(cause));
      } finally {
        setPending(false);
      }
    })();
  };

  return (
    <form className='space-y-5' onSubmit={handleSubmit}>
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
      {validationError ? (
        <FormStatus type='error'>{validationError}</FormStatus>
      ) : null}
      <Button className='w-full' disabled={pending} type='submit'>
        {pending ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  );
}

function registrationError(error: unknown): string {
  if (error instanceof ApiClientError) {
    const payload = error.payload;
    if (payload && typeof payload === 'object' && 'message' in payload) {
      const message = (payload as { message?: unknown }).message;
      if (typeof message === 'string' && message) return message;
    }
    return error.message;
  }
  return error instanceof Error
    ? error.message
    : 'Unable to create the account.';
}
