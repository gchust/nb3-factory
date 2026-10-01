/**
 * The administrator's temporary-share panel.
 *
 * It is the only place a specific draft is opened to a specific account. The
 * panel is rendered only for callers who may manage shares — the same
 * composite capability the `/api/library/documents/:id/shares` endpoints
 * check — so a maintainer or reader never sees an account list.
 *
 * Revoking takes effect on the reader's next request; nothing here caches.
 */
import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { XIcon } from 'lucide-react';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  createShare,
  deleteShare,
  fetchAccounts,
  fetchShares,
} from '../library-api.js';
import { libraryShareResource } from '../library-resource.js';
import type { LibraryAccount, LibraryShare } from '../types.js';

function accountLabel(account: LibraryAccount): string {
  return account.username
    ? `${account.name} (${account.username})`
    : account.name;
}

export function DocumentShares({
  documentId,
}: {
  readonly documentId: string;
}): ReactElement | null {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const canManage = useCan({
    resource: libraryShareResource,
    action: 'manage',
  });
  const [shares, setShares] = useState<LibraryShare[]>([]);
  const [accounts, setAccounts] = useState<LibraryAccount[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const enabled = canManage.can;

  const load = useCallback(
    (signal?: AbortSignal) => {
      if (!enabled) {
        return;
      }
      void Promise.all([
        fetchShares(api, documentId, signal),
        fetchAccounts(api, signal),
      ])
        .then(([nextShares, nextAccounts]) => {
          setShares(nextShares);
          setAccounts(nextAccounts);
        })
        .catch((reason: unknown) => {
          if (reason instanceof ApiClientError && reason.status === 403) {
            return;
          }
          if (signal?.aborted) {
            return;
          }
          toaster.show({ type: 'error', title: t('library.shares.loadError') });
        });
    },
    [api, documentId, enabled, t, toaster],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const accountNames = useMemo(() => {
    const index = new Map(accounts.map((account) => [account.id, account]));
    return index;
  }, [accounts]);

  if (!enabled) {
    return null;
  }

  const available = accounts.filter(
    (account) => !shares.some((share) => share.userId === account.id),
  );
  const accountItems = available.map((account) => ({
    value: account.id,
    label: accountLabel(account),
  }));

  async function add(): Promise<void> {
    if (!selected) {
      return;
    }
    setIsBusy(true);
    try {
      await createShare(api, documentId, selected);
      setSelected(null);
      load();
    } catch {
      toaster.show({ type: 'error', title: t('library.shares.error') });
    } finally {
      setIsBusy(false);
    }
  }

  async function remove(share: LibraryShare): Promise<void> {
    setIsBusy(true);
    try {
      await deleteShare(api, documentId, share.id);
      load();
    } catch {
      toaster.show({ type: 'error', title: t('library.shares.error') });
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section className='space-y-3 rounded-lg border border-border p-4'>
      <div className='space-y-1'>
        <h2 className='font-heading text-base font-medium'>
          {t('library.shares.title')}
        </h2>
        <p className='text-sm text-muted-foreground'>
          {t('library.shares.description')}
        </p>
      </div>

      {shares.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t('library.shares.empty')}
        </p>
      ) : (
        <ul className='space-y-2'>
          {shares.map((share) => {
            const account = accountNames.get(share.userId);
            return (
              <li
                className='flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2'
                key={share.id}
              >
                <span className='text-sm'>
                  {account
                    ? accountLabel(account)
                    : t('library.shares.unknownAccount')}
                </span>
                <Button
                  aria-label={t('library.shares.revoke')}
                  disabled={isBusy}
                  onClick={() => {
                    void remove(share);
                  }}
                  size='icon-sm'
                  variant='ghost'
                >
                  <XIcon />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <div className='flex flex-col gap-2 sm:flex-row sm:items-end'>
        <div className='flex-1 space-y-2'>
          <Label htmlFor='library-share-account'>
            {t('library.shares.account')}
          </Label>
          <Select
            items={accountItems}
            onValueChange={(value) => setSelected(value ?? null)}
            value={selected}
          >
            <SelectTrigger className='w-full' id='library-share-account'>
              <SelectValue
                placeholder={t('library.shares.selectPlaceholder')}
              />
            </SelectTrigger>
            <SelectContent>
              {available.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {accountLabel(account)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          disabled={isBusy || !selected}
          onClick={() => {
            void add();
          }}
        >
          {t('library.shares.grant')}
        </Button>
      </div>
    </section>
  );
}
