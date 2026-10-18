import { ApiClientError, useApiClient } from '@nocobase/app-client';
import {
  UsersClient,
  type ManagedUser,
} from '@nocobase/app-plugin-users/client/user-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Trash2Icon, UserPlusIcon } from 'lucide-react';
import { type ReactElement, useCallback, useEffect, useState } from 'react';

import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Skeleton } from '#components/ui/skeleton';

import { createShare, deleteShare, fetchShares } from '../api.js';
import type { LibraryDocument, LibraryShare } from '../types.js';

/**
 * The administrator's temporary share panel for one document.
 *
 * It writes through this application's own share routes, which are the Sharing
 * Rules settings surface: each row is a real Sharing Rule over `view` only,
 * naming these document ids and one colleague. Reading a shared draft never
 * carries editing with it, and a document marked confidential stays out of the
 * colleague's reach even while a rule here names it, because the
 * confidentiality Restriction Rule is intersected after the share expands the
 * read scope.
 */
export function DocumentShares({
  document,
}: {
  readonly document: LibraryDocument;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [shares, setShares] = useState<readonly LibraryShare[]>();
  const [people, setPeople] = useState<readonly ManagedUser[]>([]);
  const [subjectId, setSubjectId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const reload = useCallback(() => {
    let live = true;
    fetchShares(api, document.id).then(
      (rows) => {
        if (live) setShares(rows);
      },
      () => {
        if (live) setShares([]);
      },
    );
    return () => {
      live = false;
    };
  }, [api, document.id]);

  useEffect(reload, [reload]);

  useEffect(() => {
    let live = true;
    new UsersClient(api).list({ pageSize: 100 }).then(
      (page) => {
        if (live) setPeople(page.items);
      },
      () => {
        if (live) setPeople([]);
      },
    );
    return () => {
      live = false;
    };
  }, [api]);

  const add = (): void => {
    if (!subjectId || busy) return;
    setBusy(true);
    setError(undefined);
    createShare(api, document.id, subjectId)
      .then(() => {
        setSubjectId('');
        reload();
      })
      .catch((cause: unknown) => {
        setError(
          cause instanceof ApiClientError && cause.status === 403
            ? t('library.shares.forbidden')
            : t('library.shares.failed'),
        );
      })
      .finally(() => setBusy(false));
  };

  const revoke = (share: LibraryShare): void => {
    setBusy(true);
    setError(undefined);
    deleteShare(api, document.id, share.key)
      .then(() => reload())
      .catch(() => setError(t('library.shares.failed')))
      .finally(() => setBusy(false));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('library.shares.title')}</CardTitle>
        <CardDescription>{t('library.shares.description')}</CardDescription>
        {document.confidential ? (
          <CardAction>
            <span className='text-xs text-(--status-warning)'>
              {t('library.shares.confidentialNotice')}
            </span>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {error ? (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className='flex flex-wrap items-end gap-2'>
          <Select
            value={subjectId || 'none'}
            onValueChange={(value: string | null) =>
              setSubjectId(!value || value === 'none' ? '' : value)
            }
          >
            <SelectTrigger
              className='w-56'
              aria-label={t('library.shares.person')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='none'>
                {t('library.shares.pickPerson')}
              </SelectItem>
              {people.map((person) => (
                <SelectItem key={person.id} value={person.id}>
                  {person.name || person.username || person.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button disabled={busy || !subjectId} onClick={add}>
            <UserPlusIcon />
            {t('library.shares.add')}
          </Button>
        </div>

        {shares === undefined ? (
          <Skeleton className='h-16 w-full' />
        ) : shares.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('library.shares.empty')}
          </p>
        ) : (
          <ul className='flex flex-col divide-y divide-border'>
            {shares.map((share) => (
              <li
                key={share.key}
                className='flex items-center justify-between gap-2 py-2'
              >
                <span className='text-sm'>
                  {share.subjectIds
                    .map((id) => personName(people, id))
                    .join('、')}
                </span>
                <Button
                  variant='ghost'
                  size='sm'
                  disabled={busy}
                  onClick={() => revoke(share)}
                >
                  <Trash2Icon />
                  {t('library.shares.revoke')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function personName(people: readonly ManagedUser[], id: string): string {
  const person = people.find((candidate) => candidate.id === id);
  return person ? person.name || person.username || person.email : id;
}
