import { useEffect, useState, type FormEvent, type ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import {
  apiClientToken,
  resolveAppUrl,
  useService,
  type ApiClient,
} from '@nocobase/app-client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/production/select-field';
import { staffApi, type RegistrationOptions } from '@/lib/production-api';
import { translateError } from '@/lib/production-messages';

import { FormStatus } from '../components/form-status';

const ROLE_LABEL_KEYS: Record<string, string> = {
  'production-supervisor': 'signUp.roleSupervisor',
  'team-leader': 'signUp.roleTeamLeader',
  'quality-inspector': 'signUp.roleInspector',
};

const DEFAULT_ROLE = 'team-leader';
const TEAM_REQUIRED_ROLE = 'team-leader';

export function PasswordRegistrationForm(): ReactElement {
  const { t } = useTranslation();
  const api = useService<ApiClient>(apiClientToken);
  const [options, setOptions] = useState<RegistrationOptions>();
  const [confirmation, setConfirmation] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState(DEFAULT_ROLE);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string>();
  const [errorMessage, setErrorMessage] = useState<string>();
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    let active = true;
    void staffApi
      .registrationOptions(api)
      .then((loaded) => {
        if (!active) return;
        setOptions(loaded);
        setRole((current) =>
          loaded.roles.includes(current)
            ? current
            : (loaded.roles[0] ?? DEFAULT_ROLE),
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api]);

  const roles = options?.roles ?? [];
  const teams = options?.teams ?? [];
  const needsTeam = role === TEAM_REQUIRED_ROLE;

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (password !== confirmation) {
      setValidationError(t('signUp.passwordsMismatch'));
      return;
    }
    if (needsTeam && !teamId) {
      setValidationError(t('signUp.teamRequired'));
      return;
    }
    setValidationError(undefined);
    setErrorMessage(undefined);
    setIsPending(true);
    try {
      await staffApi.register(api, {
        name,
        username,
        email,
        password,
        role,
        teamId: needsTeam && teamId ? Number(teamId) : null,
      });
      window.location.assign(resolveAppUrl('/login'));
    } catch (error) {
      setErrorMessage(translateError(t, error));
      setIsPending(false);
    }
  };

  const message = validationError ?? errorMessage;

  return (
    <form
      className='space-y-5'
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
    >
      <div className='space-y-2'>
        <Label htmlFor='name'>{t('signUp.name')}</Label>
        <Input
          id='name'
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='username'>{t('signUp.username')}</Label>
        <Input
          autoComplete='username'
          id='username'
          onChange={(event) => setUsername(event.target.value)}
          required
          value={username}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='register-email'>{t('signUp.email')}</Label>
        <Input
          autoComplete='email'
          id='register-email'
          onChange={(event) => setEmail(event.target.value)}
          required
          type='email'
          value={email}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='register-password'>{t('signUp.password')}</Label>
        <Input
          autoComplete='new-password'
          id='register-password'
          onChange={(event) => setPassword(event.target.value)}
          required
          type='password'
          value={password}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='confirm-password'>{t('signUp.confirmPassword')}</Label>
        <Input
          autoComplete='new-password'
          id='confirm-password'
          onChange={(event) => setConfirmation(event.target.value)}
          required
          type='password'
          value={confirmation}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='register-role'>{t('signUp.role')}</Label>
        <SelectField
          id='register-role'
          onValueChange={setRole}
          options={roles.map((value) => ({
            value,
            label: t(ROLE_LABEL_KEYS[value] ?? value, { defaultValue: value }),
          }))}
          value={role}
        />
        <p className='text-xs text-muted-foreground'>{t('signUp.roleHint')}</p>
      </div>
      {needsTeam ? (
        <div className='space-y-2'>
          <Label htmlFor='register-team'>{t('signUp.team')}</Label>
          <SelectField
            id='register-team'
            onValueChange={setTeamId}
            options={teams.map((team) => ({
              value: String(team.id),
              label: team.name,
            }))}
            placeholder={t('signUp.selectTeam')}
            value={teamId}
          />
        </div>
      ) : null}
      {message ? <FormStatus type='error'>{message}</FormStatus> : null}
      <Button className='w-full' disabled={isPending} type='submit'>
        {isPending ? t('signUp.submitting') : t('signUp.submit')}
      </Button>
    </form>
  );
}
