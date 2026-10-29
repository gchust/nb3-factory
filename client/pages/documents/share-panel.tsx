import type { ManagedUser } from '@nocobase/app-plugin-users/client/user-client';
import { UsersClient } from '@nocobase/app-plugin-users/client/user-client';
import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { UserPlusIcon } from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';

import { Button } from '#components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import { Spinner } from '#components/ui/spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';

import {
  fetchDocumentShares,
  revokeDocumentShare,
  shareDocument,
} from './document-api.js';
import type { DocumentShare } from './types.js';

export interface SharePanelProps {
  readonly documentId: string;
  readonly confidential: boolean;
  /** Called after a share is added or revoked, so the owner of the page can refresh what it shows. */
  readonly onChanged: () => void;
}

/**
 * Admin-only temporary sharing. A single colleague is added to a draft and removed again; the server decides whether
 * the share actually opens the document (a confidential one stays hidden).
 */
export function SharePanel({
  documentId,
  confidential,
  onChanged,
}: SharePanelProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const users = useMemo(() => new UsersClient(api), [api]);

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const [state, setState] = useState<{
    readonly key: string;
    readonly shares?: readonly DocumentShare[];
    readonly people?: readonly ManagedUser[];
    readonly failed?: boolean;
  }>();
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const key = String(reloadCount);
    Promise.all([
      fetchDocumentShares(api, documentId, controller.signal),
      users.list({ pageSize: 100 }),
    ]).then(
      ([shareList, page]) => {
        if (!controller.signal.aborted) {
          setState({ key, shares: shareList.data, people: page.items });
        }
      },
      () => {
        if (!controller.signal.aborted) {
          setState((previous) => ({ ...previous, key, failed: true }));
        }
      },
    );
    return () => controller.abort();
  }, [api, documentId, users, reloadCount]);

  const loading = state?.key !== String(reloadCount);
  const shares = loading ? undefined : state?.shares;
  const people = state?.people ?? [];
  const sharedIds = new Set((shares ?? []).map((share) => share.userId));
  const options = people
    .filter((person) => !person.disabledAt && !sharedIds.has(person.id))
    .map((person) => ({
      value: person.id,
      label: person.name || person.username || person.email,
    }));

  const run = async (action: () => Promise<unknown>, failure: string) => {
    setBusy(true);
    try {
      await action();
      reload();
      onChanged();
    } catch {
      toaster.show({ type: 'error', title: failure });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('documents.shares.title')}</CardTitle>
        <CardDescription>{t('documents.shares.description')}</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {confidential ? (
          <p className='rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground'>
            {t('documents.shares.confidential')}
          </p>
        ) : null}

        {state?.failed && shares === undefined ? (
          <p className='text-sm text-destructive'>
            {t('documents.error.request')}
          </p>
        ) : null}

        {shares && shares.length > 0 ? (
          <ul className='flex flex-col gap-2'>
            {shares.map((share) => (
              <li
                key={share.userId}
                className='flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2'
              >
                <span className='text-sm'>
                  {share.userName ?? share.userId}
                </span>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => revokeDocumentShare(api, documentId, share.userId),
                      t('documents.shares.revokeFailed'),
                    )
                  }
                >
                  {t('documents.shares.revoke')}
                </Button>
              </li>
            ))}
          </ul>
        ) : shares ? (
          <p className='text-sm text-muted-foreground'>
            {t('documents.shares.empty')}
          </p>
        ) : (
          <Spinner />
        )}

        <div className='flex flex-wrap items-end gap-2'>
          <div className='flex min-w-48 flex-1 flex-col gap-1.5'>
            <span className='text-sm font-medium'>
              {t('documents.shares.select')}
            </span>
            <Select
              items={options}
              value={selected}
              onValueChange={(next: string | null) => setSelected(next)}
            >
              <SelectTrigger aria-label={t('documents.shares.select')}>
                <SelectValue placeholder={t('documents.shares.placeholder')} />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            disabled={busy || !selected}
            onClick={() => {
              const userId = selected;
              if (!userId) return;
              void run(async () => {
                const share = await shareDocument(api, documentId, userId);
                setSelected(null);
                toaster.show({
                  type: 'success',
                  title: t('documents.shares.sharedWith', {
                    name: share.userName ?? userId,
                  }),
                });
              }, t('documents.shares.addFailed'));
            }}
          >
            <UserPlusIcon data-icon='inline-start' />
            {busy ? t('documents.shares.sharing') : t('documents.shares.add')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
