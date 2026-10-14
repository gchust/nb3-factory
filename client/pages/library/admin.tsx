import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { Loading } from '#components/loading';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card';
import { StatusBadge } from '#components/status-badge';

import {
  errorMessage,
  isForbidden,
  type LibraryActor,
  type LibraryMember,
} from './api.js';
import { useLibraryClient, useSessionExpiredRedirect } from './use-library.js';

function MemberRow({
  member,
  busy,
  onSetRole,
  onToggleDisabled,
}: {
  readonly member: LibraryMember;
  readonly busy: boolean;
  readonly onSetRole: (role: 'editor' | 'reader') => void;
  readonly onToggleDisabled: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <li className='flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between'>
      <div className='min-w-0'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='text-sm font-medium'>
            {member.name || member.email}
          </span>
          {member.isAdmin ? (
            <StatusBadge tone='info'>{t('library.admin.you')}</StatusBadge>
          ) : null}
          {member.disabled ? (
            <StatusBadge tone='warning'>
              {t('library.admin.disabled')}
            </StatusBadge>
          ) : (
            <StatusBadge tone='success'>
              {t('library.admin.active')}
            </StatusBadge>
          )}
        </div>
        <p className='truncate text-xs text-muted-foreground'>{member.email}</p>
      </div>
      <div className='flex flex-wrap items-center gap-2'>
        {member.isAdmin ? null : (
          <>
            <Button
              type='button'
              size='sm'
              variant={member.role === 'editor' ? 'default' : 'outline'}
              disabled={busy}
              onClick={() => onSetRole('editor')}
            >
              {t('library.admin.role.editor')}
            </Button>
            <Button
              type='button'
              size='sm'
              variant={member.role === 'reader' ? 'default' : 'outline'}
              disabled={busy}
              onClick={() => onSetRole('reader')}
            >
              {t('library.admin.role.reader')}
            </Button>
            <Button
              type='button'
              size='sm'
              variant={member.disabled ? 'outline' : 'destructive'}
              disabled={busy}
              onClick={onToggleDisabled}
            >
              {member.disabled
                ? t('library.admin.enable')
                : t('library.admin.disable')}
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

export default function LibraryAdminPage(): ReactElement {
  const { t } = useTranslation();
  const client = useLibraryClient();
  const [actor, setActor] = useState<LibraryActor | null>(null);
  const [members, setMembers] = useState<LibraryMember[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useSessionExpiredRedirect(error);

  useEffect(() => {
    let cancelled = false;
    Promise.all([client.actor(), client.members()])
      .then(([nextActor, nextMembers]) => {
        if (cancelled) return;
        setActor(nextActor);
        setMembers(nextMembers);
        setError(null);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause);
      });
    return () => {
      cancelled = true;
    };
  }, [client, version]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);

  const setRole = async (
    member: LibraryMember,
    role: 'editor' | 'reader',
  ): Promise<void> => {
    setBusyUserId(member.userId);
    setActionError(null);
    try {
      await client.setRole(member.userId, role);
      reload();
    } catch (cause) {
      setActionError(`${t('library.admin.roleFailed')} ${errorMessage(cause)}`);
    } finally {
      setBusyUserId(null);
    }
  };

  const toggleDisabled = async (member: LibraryMember): Promise<void> => {
    setBusyUserId(member.userId);
    setActionError(null);
    try {
      if (member.disabled) await client.enableUser(member.userId);
      else await client.disableUser(member.userId);
      reload();
    } catch (cause) {
      const message = member.disabled
        ? t('library.admin.enableFailed')
        : t('library.admin.disableFailed');
      setActionError(`${message} ${errorMessage(cause)}`);
    } finally {
      setBusyUserId(null);
    }
  };

  const loading = members === null && error === null;
  const forbidden = isForbidden(error);

  return (
    <PageContainer>
      <PageHeader
        title={t('library.admin.title')}
        description={t('library.admin.description')}
      />
      {loading ? <Loading /> : null}
      {forbidden ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('library.forbidden.title')}</AlertTitle>
          <AlertDescription>
            {t('library.forbidden.description')}
          </AlertDescription>
        </Alert>
      ) : null}
      {error !== null && !forbidden ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('library.error.title')}</AlertTitle>
          <AlertDescription>{errorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}
      {actionError ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('library.admin.actionFailed')}</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      ) : null}
      {members !== null ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('library.admin.members')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className='divide-y divide-border'>
              {members.map((member) => (
                <MemberRow
                  key={member.userId}
                  member={member}
                  busy={busyUserId === member.userId}
                  onSetRole={(role) => void setRole(member, role)}
                  onToggleDisabled={() => void toggleDisabled(member)}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
      {actor !== null && !actor.isAdmin && !forbidden ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('library.forbidden.title')}</AlertTitle>
          <AlertDescription>
            {t('library.forbidden.description')}
          </AlertDescription>
        </Alert>
      ) : null}
    </PageContainer>
  );
}
