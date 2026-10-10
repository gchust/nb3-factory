import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

import {
  addMaterialShare,
  fetchEnabledUsers,
  removeMaterialShare,
} from './materials-api.js';
import type { ManagedUserOption, MaterialDetail } from './types.js';

export interface SharePanelProps {
  readonly material: MaterialDetail;
  readonly onChanged: () => void;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/**
 * The administrator's temporary single-document share. It opens one document to one colleague, never a whole set of
 * drafts, and revoking it takes effect immediately. A confidential document may be selected here but still stays
 * unreadable, which the server enforces.
 */
export function SharePanel({
  material,
  onChanged,
}: SharePanelProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = reloadCount;
  const [result, setResult] = useState<{
    readonly key: number;
    readonly users?: readonly ManagedUserOption[];
    readonly error?: unknown;
  }>();
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchEnabledUsers(api, controller.signal).then(
      (users) => {
        if (!controller.signal.aborted) setResult({ key: reloadCount, users });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key: reloadCount, error });
      },
    );
    return () => controller.abort();
  }, [api, reloadCount]);

  const usersLoading = result?.key !== requestKey;
  const users = result?.users;
  const usersError = !usersLoading && result?.error !== undefined;

  const sharedIds = new Set(material.shares.map((share) => share.userId));
  const available = (users ?? []).filter((user) => !sharedIds.has(user.id));

  async function handleAdd(): Promise<void> {
    if (selected.length === 0 || busy) return;
    setBusy(true);
    try {
      const share = await addMaterialShare(api, material.id, selected);
      toaster.show({
        type: 'success',
        title: t('materials.share.granted', { name: share.userName }),
      });
      setSelected('');
      onChanged();
    } catch {
      toaster.show({ type: 'error', title: t('materials.share.failed') });
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(userId: string): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      await removeMaterialShare(api, material.id, userId);
      toaster.show({ type: 'success', title: t('materials.share.revoked') });
      onChanged();
    } catch {
      toaster.show({ type: 'error', title: t('materials.share.failed') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className='space-y-4 rounded-lg border border-border p-4'>
      <div>
        <h2 className='font-heading text-lg font-medium'>
          {t('materials.share.title')}
        </h2>
        <p className='mt-1 text-sm text-muted-foreground'>
          {t('materials.share.description')}
        </p>
      </div>

      {material.shares.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t('materials.share.empty')}
        </p>
      ) : (
        <ul className='divide-y divide-border rounded-lg border border-border'>
          {material.shares.map((share) => (
            <li
              key={share.userId}
              className='flex items-center justify-between gap-3 px-3 py-2'
            >
              <div className='min-w-0'>
                <p className='truncate text-sm font-medium'>{share.userName}</p>
                <p className='truncate text-xs text-muted-foreground'>
                  {t('materials.share.since', {
                    date: formatDate(share.createdAt),
                  })}
                </p>
              </div>
              <Button
                type='button'
                size='sm'
                variant='ghost'
                disabled={busy}
                onClick={() => void handleRevoke(share.userId)}
              >
                <Trash2 aria-hidden='true' />
                {t('materials.share.revoke')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
        <label className='sr-only' htmlFor='material-share-user'>
          {t('materials.share.user')}
        </label>
        <select
          id='material-share-user'
          className='h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 sm:max-w-xs dark:bg-input/30'
          value={selected}
          disabled={usersLoading || usersError || busy}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value=''>{t('materials.share.selectPlaceholder')}</option>
          {available.map((user) => {
            const label = user.name || user.username || user.email;
            return (
              <option key={user.id} value={user.id}>
                {label}
              </option>
            );
          })}
        </select>
        <Button
          type='button'
          disabled={selected.length === 0 || busy}
          onClick={() => void handleAdd()}
        >
          {busy ? <Spinner /> : null}
          {t('materials.share.add')}
        </Button>
      </div>

      {usersLoading ? (
        <p className='flex items-center gap-2 text-sm text-muted-foreground'>
          <Spinner />
          {t('status.loading')}
        </p>
      ) : null}
      {usersError ? (
        <p className='text-sm text-destructive'>
          {t('materials.share.loadFailed')}{' '}
          <button
            type='button'
            className='underline underline-offset-4'
            onClick={() => setReloadCount((count) => count + 1)}
          >
            {t('status.retry')}
          </button>
        </p>
      ) : null}
      {!usersLoading && !usersError && available.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t('materials.share.noUsers')}
        </p>
      ) : null}
    </section>
  );
}
