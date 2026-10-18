import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { UserPlusIcon } from 'lucide-react';
import { type ReactElement, useCallback, useEffect, useState } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { Skeleton } from '#components/ui/skeleton';
import { Spinner } from '#components/ui/spinner';

import { createTeamMember, getTeam, setMemberRoles } from '../tickets/api.js';
import type { Team } from '../tickets/types.js';

export default function TeamPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [team, setTeam] = useState<Team>();
  const [error, setError] = useState<string>();
  const [reloadCount, setReloadCount] = useState(0);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await getTeam(api);
        if (!cancelled) setTeam(result);
      } catch (caught) {
        if (cancelled) return;
        setError(
          caught instanceof ApiClientError
            ? caught.message
            : t('tickets.team.error.load'),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, reloadCount, t]);

  return (
    <PageContainer className='mx-auto max-w-5xl'>
      <PageHeader
        title={t('tickets.team.title')}
        description={t('tickets.team.description')}
      />

      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {!team && !error ? (
        <div className='flex flex-col gap-3'>
          <Skeleton className='h-40 w-full' />
          <Skeleton className='h-40 w-full' />
        </div>
      ) : null}

      {team ? (
        <>
          <CreateMemberCard
            team={team}
            onCreated={() => {
              toaster.show({
                type: 'success',
                title: t('tickets.team.create.success'),
              });
              reload();
            }}
            onError={(message) => setError(message)}
          />
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>
                {t('tickets.team.members')}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              {team.members.map((member) => (
                <MemberRow
                  key={`${member.id}:${member.roles.join(',')}`}
                  team={team}
                  memberId={member.id}
                  onSaved={() => {
                    toaster.show({
                      type: 'success',
                      title: t('tickets.team.roles.success'),
                    });
                    reload();
                  }}
                  onError={(message) => setError(message)}
                />
              ))}
            </CardContent>
          </Card>
        </>
      ) : null}
    </PageContainer>
  );
}

function CreateMemberCard({
  team,
  onCreated,
  onError,
}: {
  readonly team: Team;
  readonly onCreated: () => void;
  readonly onError: (message: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roles, setRoles] = useState<readonly string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const assignable = team.roles.filter((role) => role.assignable);

  const toggle = (key: string): void => {
    setRoles((current) =>
      current.includes(key)
        ? current.filter((value) => value !== key)
        : [...current, key],
    );
  };

  const submit = async (): Promise<void> => {
    if (!name.trim() || !email.trim() || !password) {
      onError(t('tickets.team.create.required'));
      return;
    }
    setSubmitting(true);
    try {
      await createTeamMember(api, {
        name: name.trim(),
        username: username.trim() || undefined,
        email: email.trim(),
        password,
        roles,
      });
      setName('');
      setUsername('');
      setEmail('');
      setPassword('');
      setRoles([]);
      onCreated();
    } catch (caught) {
      onError(
        caught instanceof ApiClientError
          ? caught.message
          : t('tickets.team.create.failed'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2 text-base'>
          <UserPlusIcon className='size-4' aria-hidden />
          {t('tickets.team.create.title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          className='grid gap-4 sm:grid-cols-2'
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className='flex flex-col gap-2'>
            <Label htmlFor='team-name'>{t('tickets.team.field.name')}</Label>
            <Input
              id='team-name'
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete='off'
            />
          </div>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='team-username'>
              {t('tickets.team.field.username')}
            </Label>
            <Input
              id='team-username'
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete='off'
            />
          </div>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='team-email'>{t('tickets.team.field.email')}</Label>
            <Input
              id='team-email'
              type='email'
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete='off'
            />
          </div>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='team-password'>
              {t('tickets.team.field.password')}
            </Label>
            <Input
              id='team-password'
              type='password'
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete='new-password'
            />
          </div>
          <fieldset className='flex flex-col gap-2 sm:col-span-2'>
            <legend className='text-sm font-medium'>
              {t('tickets.team.field.roles')}
            </legend>
            <div className='flex flex-wrap gap-4'>
              {assignable.map((role) => (
                <label
                  key={role.key}
                  className='flex items-center gap-2 text-sm'
                >
                  <input
                    type='checkbox'
                    className='size-4 accent-primary'
                    checked={roles.includes(role.key)}
                    onChange={() => toggle(role.key)}
                  />
                  {role.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className='sm:col-span-2'>
            <Button type='submit' disabled={submitting}>
              {submitting ? <Spinner data-icon='inline-start' /> : null}
              {t('tickets.team.create.submit')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function MemberRow({
  team,
  memberId,
  onSaved,
  onError,
}: {
  readonly team: Team;
  readonly memberId: string;
  readonly onSaved: () => void;
  readonly onError: (message: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const member = team.members.find((item) => item.id === memberId);
  const [roles, setRoles] = useState<readonly string[]>(member?.roles ?? []);
  const [saving, setSaving] = useState(false);

  if (!member) return <></>;

  const toggle = (key: string): void => {
    setRoles((current) =>
      current.includes(key)
        ? current.filter((value) => value !== key)
        : [...current, key],
    );
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      await setMemberRoles(api, member.id, roles);
      onSaved();
    } catch (caught) {
      onError(
        caught instanceof ApiClientError
          ? caught.message
          : t('tickets.team.roles.failed'),
      );
    } finally {
      setSaving(false);
    }
  };

  const fixedRoles = member.roles.filter(
    (role) =>
      !team.roles.some((option) => option.key === role && option.assignable),
  );

  return (
    <div className='flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between'>
      <div className='min-w-0'>
        <p className='font-medium'>
          {member.name ?? member.username ?? member.id}
        </p>
        <p className='text-xs text-muted-foreground'>{member.email}</p>
      </div>
      <div className='flex flex-wrap items-center gap-4'>
        {team.roles
          .filter((role) => role.assignable)
          .map((role) => (
            <label key={role.key} className='flex items-center gap-2 text-sm'>
              <input
                type='checkbox'
                className='size-4 accent-primary'
                checked={roles.includes(role.key)}
                onChange={() => toggle(role.key)}
              />
              {role.label}
            </label>
          ))}
        {fixedRoles.map((role) => (
          <span key={role} className='text-xs text-muted-foreground'>
            {role}
          </span>
        ))}
        <Button
          type='button'
          size='sm'
          variant='outline'
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? <Spinner data-icon='inline-start' /> : null}
          {t('actions.save')}
        </Button>
      </div>
    </div>
  );
}
