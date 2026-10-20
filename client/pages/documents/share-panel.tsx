import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Clock, Share2, Trash2, UserRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { StatusBadge } from '#components/status-badge';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Skeleton } from '#components/ui/skeleton';
import { ConfirmAction } from '../settings/shared.js';
import { formatInstant, useDocumentResource } from './data.js';
import { documentErrorMessage } from './document-error-message.js';
import type {
  DocumentShare,
  DocumentShareDataResponse,
  DocumentShareListResponse,
  ShareCandidateListResponse,
} from './types.js';

export function SharePanel({
  documentId,
  currentUserId,
}: {
  readonly documentId: string;
  readonly currentUserId?: string;
}) {
  const { t, i18n } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const shares = useDocumentResource<DocumentShareListResponse>(
    `documents/${encodeURIComponent(documentId)}/shares`,
  );
  const candidates = useDocumentResource<ShareCandidateListResponse>(
    'documents/share-candidates',
  );
  const [userId, setUserId] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState<DocumentShare>();
  const [revokeBusy, setRevokeBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [formError, setFormError] = useState<string>();

  const people = (candidates.data?.data ?? []).filter(
    (candidate) => candidate.id !== currentUserId,
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!userId) {
      setFormError(t('documents.share.personRequired'));
      return;
    }
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
      setFormError(t('documents.share.expiryFuture'));
      return;
    }
    setFormError(undefined);
    setError(undefined);
    setBusy(true);
    try {
      await api.request<DocumentShareDataResponse>({
        path: `documents/${encodeURIComponent(documentId)}/shares`,
        method: 'POST',
        json: {
          userId,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        },
      });
      setUserId('');
      setExpiresAt('');
      shares.reload();
      toaster.show({
        type: 'success',
        title: t('documents.share.openedToast'),
      });
    } catch (value) {
      setError(value);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!revoking) return;
    setRevokeBusy(true);
    setError(undefined);
    try {
      await api.request<DocumentShareDataResponse>({
        path: `documents/${encodeURIComponent(documentId)}/shares/${encodeURIComponent(revoking.id)}`,
        method: 'DELETE',
      });
      setRevoking(undefined);
      shares.reload();
      toaster.show({
        type: 'success',
        title: t('documents.share.revokedToast'),
      });
    } catch (value) {
      setError(value);
    } finally {
      setRevokeBusy(false);
    }
  };

  return (
    <section className='flex flex-col gap-5 rounded-xl border p-5'>
      <div>
        <h2 className='inline-flex items-center gap-2 font-heading text-base font-medium'>
          <Share2 className='size-4' />
          {t('documents.share.title')}
        </h2>
        <p className='mt-1 text-sm leading-6 text-muted-foreground'>
          {t('documents.share.description')}
        </p>
      </div>

      {error != null && (
        <Alert variant='destructive'>
          <AlertDescription>{documentErrorMessage(error, t)}</AlertDescription>
        </Alert>
      )}

      {shares.error != null ? (
        <DocumentShareListError
          message={documentErrorMessage(shares.error, t)}
          retry={shares.reload}
        />
      ) : shares.loading && !shares.data ? (
        <Skeleton className='h-20 w-full' />
      ) : shares.data?.data.length ? (
        <ul className='divide-y rounded-lg border'>
          {shares.data.data.map((share) => (
            <li
              key={share.id}
              className='flex flex-wrap items-center justify-between gap-3 p-3 text-sm'
            >
              <div className='min-w-0'>
                <p className='flex items-center gap-2 font-medium'>
                  <UserRound className='size-4 text-muted-foreground' />
                  <span className='truncate'>{share.userName}</span>
                  <StatusBadge
                    tone={
                      share.active
                        ? 'success'
                        : share.revokedAt
                          ? 'neutral'
                          : 'warning'
                    }
                    size='sm'
                  >
                    {t(
                      share.active
                        ? 'documents.share.active'
                        : share.revokedAt
                          ? 'documents.share.revoked'
                          : 'documents.share.expired',
                    )}
                  </StatusBadge>
                </p>
                <p className='mt-1 flex items-center gap-1.5 text-muted-foreground'>
                  <Clock className='size-3.5' />
                  {share.expiresAt
                    ? t('documents.share.until', {
                        date: formatInstant(share.expiresAt, i18n.language),
                      })
                    : t('documents.share.noExpiry')}
                  <span aria-hidden>·</span>
                  {t('documents.share.by', { name: share.sharedByName })}
                </p>
              </div>
              {share.active && (
                <Button
                  variant='outline'
                  size='sm'
                  disabled={revokeBusy}
                  onClick={() => setRevoking(share)}
                >
                  <Trash2 data-icon='inline-start' />
                  {t('documents.share.revoke')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className='rounded-lg bg-muted p-4 text-sm text-muted-foreground'>
          {t('documents.share.empty')}
        </p>
      )}

      <form
        className='flex flex-col gap-3 border-t pt-5'
        onSubmit={(event) => void submit(event)}
      >
        <h3 className='text-sm font-medium'>
          {t('documents.share.openTitle')}
        </h3>
        <div className='grid gap-3 sm:grid-cols-2'>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='document-share-person'>
              {t('documents.share.person')}
            </Label>
            {candidates.error != null ? (
              <DocumentShareListError
                message={documentErrorMessage(candidates.error, t)}
                retry={candidates.reload}
              />
            ) : (
              <Select
                items={people.map((candidate) => ({
                  value: candidate.id,
                  label: candidate.name,
                }))}
                value={userId}
                onValueChange={(value) => {
                  setUserId(value ?? '');
                  setFormError(undefined);
                }}
              >
                <SelectTrigger id='document-share-person' className='w-full'>
                  <SelectValue
                    placeholder={t('documents.share.personPlaceholder')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {people.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='document-share-expiry'>
              {t('documents.share.expiry')}
            </Label>
            <Input
              id='document-share-expiry'
              type='datetime-local'
              value={expiresAt}
              onChange={(event) => {
                setExpiresAt(event.target.value);
                setFormError(undefined);
              }}
            />
          </div>
        </div>
        <p className='text-xs text-muted-foreground'>
          {t('documents.share.expiryHint')}
        </p>
        {formError && <p className='text-sm text-destructive'>{formError}</p>}
        <div>
          <Button type='submit' disabled={busy || people.length === 0}>
            <Share2 data-icon='inline-start' />
            {busy ? t('documents.share.opening') : t('documents.share.open')}
          </Button>
        </div>
      </form>

      <ConfirmAction
        open={revoking != null}
        title={t('documents.share.revokeTitle')}
        description={t('documents.share.revokeDescription', {
          name: revoking?.userName ?? '',
        })}
        confirmLabel={t('documents.share.revoke')}
        busy={revokeBusy}
        onCancel={() => setRevoking(undefined)}
        onConfirm={() => void revoke()}
      />
    </section>
  );
}

function DocumentShareListError({
  message,
  retry,
}: {
  readonly message: string;
  readonly retry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Alert variant='destructive'>
      <AlertDescription>
        {message}
        <Button variant='outline' size='sm' onClick={retry}>
          {t('documents.errors.retry')}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
