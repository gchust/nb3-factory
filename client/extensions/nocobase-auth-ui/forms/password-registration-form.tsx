import { usePasswordLogin } from '@nocobase/app-plugin-authentication/client/actions';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type FormEvent, type ReactElement } from 'react';

import { useInspectionApi } from '@/components/inspection/api.js';
import { errorMessageKey } from '@/components/inspection/error-message.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { FormStatus } from '../components/form-status';

const ROLES = ['inspector', 'teamLead', 'viewer'] as const;
type RegistrationRole = (typeof ROLES)[number];

const ROLE_LABEL_KEYS: Readonly<Record<RegistrationRole, string>> = {
  inspector: 'inspection.register.roleInspector',
  teamLead: 'inspection.register.roleTeamLead',
  viewer: 'inspection.register.roleViewer',
};

/**
 * Registration assigns one of the inspection roles to the new account, so a
 * self-registered user can use the system without an administrator in the
 * loop. The administrator role is never selectable here.
 */
export function PasswordRegistrationForm(): ReactElement {
  const { t } = useTranslation();
  const api = useInspectionApi();
  const login = usePasswordLogin();
  const [confirmation, setConfirmation] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<RegistrationRole>('inspector');
  const [validationError, setValidationError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (password !== confirmation) {
      setValidationError(t('inspection.register.passwordsDiffer'));
      return;
    }
    setValidationError(undefined);
    setSubmitting(true);
    try {
      await api.register({ name, username, email, password, role });
    } catch (cause) {
      const code = errorCodeOf(cause);
      setValidationError(t(errorMessageKey(code)));
      setSubmitting(false);
      return;
    }
    // The account exists; sign in with the same credentials so the new role is
    // in effect immediately.
    await login.submit({
      identifier: username,
      password,
      redirectTo: '/inspection/records',
    });
    setSubmitting(false);
  };

  const errorMessage = validationError ?? login.error?.message;

  return (
    <form className='space-y-5' onSubmit={(event) => void handleSubmit(event)}>
      <div className='space-y-2'>
        <Label htmlFor='name'>{t('inspection.register.name')}</Label>
        <Input
          id='name'
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='username'>{t('inspection.register.username')}</Label>
        <Input
          id='username'
          autoComplete='username'
          maxLength={30}
          minLength={3}
          onChange={(event) => setUsername(event.target.value)}
          required
          value={username}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='register-email'>{t('inspection.register.email')}</Label>
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
        <Label htmlFor='register-password'>
          {t('inspection.register.password')}
        </Label>
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
        <Label htmlFor='confirm-password'>
          {t('inspection.register.confirmPassword')}
        </Label>
        <Input
          id='confirm-password'
          autoComplete='new-password'
          onChange={(event) => setConfirmation(event.target.value)}
          required
          type='password'
          value={confirmation}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='register-role'>{t('inspection.register.role')}</Label>
        <Select
          value={role}
          onValueChange={(value) => setRole(value as RegistrationRole)}
        >
          <SelectTrigger className='w-full' id='register-role'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((candidate) => (
              <SelectItem key={candidate} value={candidate}>
                {t(ROLE_LABEL_KEYS[candidate])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className='text-xs text-muted-foreground'>
          {t('inspection.register.roleHint')}
        </p>
      </div>
      {errorMessage ? (
        <FormStatus type='error'>{errorMessage}</FormStatus>
      ) : null}
      <Button
        className='w-full'
        disabled={submitting || login.isPending}
        type='submit'
      >
        {submitting || login.isPending
          ? t('inspection.register.creating')
          : t('inspection.register.submit')}
      </Button>
    </form>
  );
}

function errorCodeOf(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const payload = (error as { payload?: unknown }).payload;
  if (typeof payload !== 'object' || payload === null) return undefined;
  const code = (payload as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}
