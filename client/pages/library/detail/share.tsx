import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';

import type {
  DocumentShare,
  LibraryDetailOutletContext,
  LibraryUser,
} from '../types.js';

interface ManagedUserPage {
  readonly items: readonly LibraryUser[];
  readonly total: number;
}

/**
 * Temporary access: grant a signed-in reader the right to read this one
 * document, or take it back. The server stores a Sharing Rule and re-evaluates
 * every request, so a revoked reader loses the body on their next refresh and
 * the original link answers "unavailable".
 *
 * A reader's read floor still applies: sharing a confidential document never
 * lets a reader see it.
 */
export default function ShareDocumentPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { documentId = '' } = useParams();
  const { document } = useOutletContext<LibraryDetailOutletContext>();
  const [shares, setShares] = useState<readonly DocumentShare[]>([]);
  const [recipients, setRecipients] = useState<readonly LibraryUser[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void Promise.all([
      api.request<{ data: DocumentShare[] }>({
        path: `library/documents/${documentId}/shares`,
        signal: controller.signal,
      }),
      api.request<{ data: ManagedUserPage }>({
        path: 'library/recipients',
        signal: controller.signal,
      }),
    ])
      .then(([shareResponse, userResponse]) => {
        if (!active) return;
        setShares(shareResponse.data);
        setRecipients(userResponse.data.items);
      })
      .catch((cause: unknown) => {
        if (!active || controller.signal.aborted) return;
        toast.add({
          type: 'error',
          title: t('library.share.loadFailed'),
          description:
            cause instanceof ApiClientError && cause.status === 403
              ? t('library.error.forbidden')
              : t('library.error.tryAgain'),
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [api, documentId, t]);

  const nameOf = useMemo(() => {
    const byId = new Map(recipients.map((user) => [user.id, user]));
    return (userId: string) => {
      const user = byId.get(userId);
      if (!user) return userId;
      return user.name || user.username || user.email;
    };
  }, [recipients]);

  const available = recipients.filter(
    (user) => !shares.some((share) => share.userId === user.id),
  );

  const grant = async (): Promise<void> => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await api.request({
        path: `library/documents/${documentId}/share`,
        method: 'POST',
        json: { userId: selected },
      });
      const refreshed = await api.request<{ data: DocumentShare[] }>({
        path: `library/documents/${documentId}/shares`,
      });
      setShares(refreshed.data);
      toast.add({
        type: 'success',
        title: t('library.share.granted'),
        description: nameOf(selected),
      });
    } catch (cause: unknown) {
      toast.add({
        type: 'error',
        title: t('library.share.grantFailed'),
        description:
          cause instanceof ApiClientError && cause.status === 403
            ? t('library.error.forbidden')
            : t('library.error.tryAgain'),
      });
    } finally {
      setBusy(false);
      setSelected('');
    }
  };

  const revoke = async (userId: string): Promise<void> => {
    try {
      await api.request({
        path: `library/documents/${documentId}/share/${userId}`,
        method: 'DELETE',
      });
      setShares((current) =>
        current.filter((share) => share.userId !== userId),
      );
      toast.add({
        type: 'success',
        title: t('library.share.revoked'),
        description: nameOf(userId),
      });
    } catch (cause: unknown) {
      toast.add({
        type: 'error',
        title: t('library.share.revokeFailed'),
        description:
          cause instanceof ApiClientError && cause.status === 403
            ? t('library.error.forbidden')
            : t('library.error.tryAgain'),
      });
    }
  };

  return (
    <RouteDialog
      title={t('library.share.title')}
      description={t('library.share.description', {
        title: document?.title ?? '',
      })}
    >
      {loading ? (
        <div className='flex items-center justify-center py-10 text-muted-foreground'>
          <Spinner />
        </div>
      ) : (
        <div className='space-y-6 py-2'>
          <FieldGroup>
            <FieldLabel htmlFor='share-recipient'>
              {t('library.share.recipient')}
            </FieldLabel>
            <div className='flex items-center gap-2'>
              <Select
                value={selected}
                onValueChange={(value) => setSelected(value as string)}
              >
                <SelectTrigger id='share-recipient' className='w-full'>
                  <SelectValue
                    placeholder={t('library.share.recipientPlaceholder')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {available.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name || user.username || user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type='button'
                onClick={() => void grant()}
                disabled={!selected || busy}
              >
                {t('library.share.grant')}
              </Button>
            </div>
          </FieldGroup>

          <div className='space-y-2'>
            <div className='text-sm font-medium'>
              {t('library.share.current')}
            </div>
            {shares.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                {t('library.share.none')}
              </p>
            ) : (
              <ul className='divide-y rounded-lg border'>
                {shares.map((share) => (
                  <li
                    key={share.ruleKey}
                    className='flex items-center justify-between gap-3 px-3 py-2'
                  >
                    <span className='truncate text-sm'>
                      {nameOf(share.userId)}
                    </span>
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      onClick={() => void revoke(share.userId)}
                    >
                      {t('library.share.revoke')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </RouteDialog>
  );
}
