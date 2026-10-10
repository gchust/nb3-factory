import { useApiClient, useToaster, type ApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { UserPlus } from 'lucide-react';
import {
  useCallback,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';

import {
  grantOrderShare,
  listDirectoryUsers,
  revokeOrderShare,
} from '@/api/service';
import { Badge } from '@/components/ui/badge';
import { ServiceErrorNotice } from '@/components/service/feedback';
import { FormField, SelectControl } from '@/components/service/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useServiceResource } from '@/hooks/use-service-resource';

import type { OrderSharesSectionProps } from './types.js';

/**
 * Temporary collaboration access.
 *
 * A share is a real row with a revocation moment and an optional expiry, and
 * the order scopes read it live, so it opens and closes access without editing
 * anybody's permission set. The form is only offered to a principal the share
 * action permits; the server refuses it independently.
 */
export function OrderShares({
  order,
  reload,
  shares,
}: OrderSharesSectionProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const canShare = useCan({
    resource: { type: 'composite', id: 'service.orders' },
    action: 'share',
  });
  const [engineerId, setEngineerId] = useState('');
  const [note, setNote] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // Reading the clock is a side effect, so the expiry comparison uses the
  // moment this panel mounted rather than calling `Date.now()` while
  // rendering. A share that lapses while the panel is open still closes access:
  // the server checks the expiry on every read, and this only labels the row.
  const [now] = useState<number>(() => Date.now());

  const loadUsers = useCallback(
    (client: ApiClient, signal: AbortSignal) =>
      listDirectoryUsers(client, signal),
    [],
  );
  const users = useServiceResource('service-order-form-users', loadUsers);

  async function grant(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (engineerId === '') return;
    setBusy(true);
    setError(null);
    try {
      await grantOrderShare(api, order.id, {
        engineerId,
        note: note.trim() || null,
        ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
      });
      setEngineerId('');
      setNote('');
      setExpiresAt('');
      toaster.show({
        type: 'success',
        title: t('service.orders.shareGranted'),
      });
      await reload();
    } catch (grantError) {
      setError(grantError);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(shareId: number): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await revokeOrderShare(api, order.id, shareId);
      toaster.show({
        type: 'success',
        title: t('service.orders.shareRevoked'),
      });
      await reload();
    } catch (revokeError) {
      setError(revokeError);
    } finally {
      setBusy(false);
    }
  }

  const nameOf = (id: string): string =>
    users.data?.find((user) => user.id === id)?.name ?? id;
  // A confidential order is manual-acceptance-only; the server refuses to
  // record a share for one, so the form is not offered either.
  const canGrantShare = canShare.can && !order.confidential;

  return (
    <div className='space-y-4'>
      {error ? <ServiceErrorNotice error={error} /> : null}

      {shares.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t('service.orders.shareEmpty')}
        </p>
      ) : (
        <ul className='space-y-2'>
          {shares.map((share) => {
            const revoked = share.revokedAt !== null;
            const expired =
              share.expiresAt !== null &&
              new Date(share.expiresAt).getTime() <= now;
            return (
              <li
                className='flex flex-wrap items-center gap-2 rounded-lg border border-border p-3 text-sm'
                key={share.id}
              >
                <span className='font-medium'>{nameOf(share.engineerId)}</span>
                {revoked ? (
                  <Badge variant='secondary'>
                    {t('service.orders.shareRevokedBadge')}
                  </Badge>
                ) : expired ? (
                  <Badge variant='outline'>
                    {t('service.orders.shareExpired')}
                  </Badge>
                ) : (
                  <Badge variant='default'>
                    {t('service.orders.shareActive')}
                  </Badge>
                )}
                {share.expiresAt ? (
                  <span className='text-xs text-muted-foreground'>
                    {t('service.orders.shareExpiresAt', {
                      time: share.expiresAt,
                    })}
                  </span>
                ) : null}
                {share.note ? (
                  <span className='min-w-0 flex-1 truncate text-muted-foreground'>
                    {share.note}
                  </span>
                ) : null}
                {!revoked && canShare.can ? (
                  <Button
                    disabled={busy}
                    onClick={() => {
                      void revoke(share.id);
                    }}
                    size='xs'
                    variant='ghost'
                  >
                    {t('service.orders.shareRevoke')}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {canShare.can && order.confidential ? (
        <p className='text-sm text-muted-foreground'>
          {t('service.orders.shareConfidential')}
        </p>
      ) : null}

      {canGrantShare ? (
        <form
          className='grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2'
          onSubmit={(event) => void grant(event)}
        >
          <FormField
            htmlFor='share-engineer'
            label={t('service.orders.shareEngineer')}
            required
          >
            <SelectControl
              disabled={users.isPending}
              id='share-engineer'
              onChange={setEngineerId}
              options={(users.data ?? []).map((user) => ({
                value: user.id,
                label: user.name,
              }))}
              placeholder={t('service.orders.shareEngineerPlaceholder')}
              value={engineerId}
            />
          </FormField>
          <FormField
            htmlFor='share-expires'
            label={t('service.orders.shareExpiresAtLabel')}
            hint={t('service.orders.shareExpiresHint')}
          >
            <Input
              id='share-expires'
              onChange={(event) => {
                setExpiresAt(event.target.value);
              }}
              type='datetime-local'
              value={expiresAt}
            />
          </FormField>
          <FormField
            className='sm:col-span-2'
            htmlFor='share-note'
            label={t('service.orders.shareNote')}
          >
            <Input
              id='share-note'
              onChange={(event) => {
                setNote(event.target.value);
              }}
              value={note}
            />
          </FormField>
          <div className='sm:col-span-2'>
            <Button
              disabled={busy || engineerId === ''}
              size='sm'
              type='submit'
              variant='outline'
            >
              {busy ? (
                <Spinner aria-hidden='true' />
              ) : (
                <UserPlus aria-hidden='true' />
              )}
              {t('service.orders.shareGrant')}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
