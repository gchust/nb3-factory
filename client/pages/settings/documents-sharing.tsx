import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  BookOpenIcon,
  LockIcon,
  Share2Icon,
  Trash2Icon,
  UsersIcon,
} from 'lucide-react';
import { type ReactElement, useMemo, useState } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Spinner } from '#components/ui/spinner';

import {
  useApiData,
  type AdminDocument,
  type AdminDocumentsResponse,
  type DocumentShares,
  type RecipientsResponse,
} from '../documents/api.js';
import { DocumentError } from '../documents/errors.js';
import { ConfirmAction } from './shared.js';

export default function DocumentsSharingPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const documentsRequest = useApiData<AdminDocumentsResponse>(
    'documentSharing/documents',
  );
  const recipientsRequest = useApiData<RecipientsResponse>(
    'documentSharing/recipients',
  );
  const documents = useMemo(
    () => documentsRequest.data?.data ?? [],
    [documentsRequest.data],
  );
  const recipients = recipientsRequest.data?.data ?? [];
  const [documentId, setDocumentId] = useState<string>();
  const [recipientId, setRecipientId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [revoking, setRevoking] = useState<{
    readonly document: AdminDocument;
    readonly share: DocumentShares;
  }>();

  const selected = useMemo(
    () => documents.find((document) => String(document.id) === documentId),
    [documentId, documents],
  );
  const share = async (): Promise<void> => {
    if (!selected || !recipientId || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.request({
        path: `documentSharing/shares/${selected.id}`,
        method: 'POST',
        json: { userId: recipientId },
      });
      toaster.show({ type: 'success', title: t('settings.shareCreated') });
      setRecipientId(undefined);
      documentsRequest.reload();
    } catch (next) {
      setError(next);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (): Promise<void> => {
    if (!revoking || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.request({
        path: `documentSharing/shares/${revoking.document.id}/${encodeURIComponent(revoking.share.userId)}`,
        method: 'DELETE',
      });
      toaster.show({ type: 'success', title: t('settings.shareRevoked') });
      setRevoking(undefined);
      documentsRequest.reload();
    } catch (next) {
      setError(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('settings.documentsSharing')}
        description={t('settings.documentsSharingDescription')}
      />

      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Share2Icon className='size-4' aria-hidden />
            {t('settings.temporarySharing')}
          </CardTitle>
          <CardDescription>
            {t('settings.temporarySharingDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          {documentsRequest.loading && !documentsRequest.data ? (
            <div className='flex justify-center py-8'>
              <Spinner />
            </div>
          ) : documentsRequest.error ? (
            <DocumentError error={documentsRequest.error} />
          ) : (
            <>
              <div className='grid gap-3 md:grid-cols-2'>
                <div className='flex flex-col gap-2'>
                  <label
                    className='text-sm font-medium'
                    htmlFor='share-document'
                  >
                    {t('settings.selectDocument')}
                  </label>
                  <Select
                    value={documentId}
                    onValueChange={(value) => {
                      setDocumentId(value as string);
                      setRecipientId(undefined);
                      setError(undefined);
                    }}
                  >
                    <SelectTrigger id='share-document' className='w-full'>
                      <SelectValue
                        placeholder={t('settings.selectDocumentHint')}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {documents.map((document) => (
                        <SelectItem
                          key={document.id}
                          value={String(document.id)}
                          disabled={document.confidential}
                        >
                          {document.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className='flex flex-col gap-2'>
                  <label
                    className='text-sm font-medium'
                    htmlFor='share-recipient'
                  >
                    {t('settings.selectRecipient')}
                  </label>
                  <Select
                    value={recipientId}
                    onValueChange={(value) => setRecipientId(value as string)}
                  >
                    <SelectTrigger
                      id='share-recipient'
                      className='w-full'
                      disabled={!selected || selected.confidential}
                    >
                      <SelectValue
                        placeholder={t('settings.selectRecipientHint')}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {recipients.map((recipient) => (
                        <SelectItem key={recipient.id} value={recipient.id}>
                          {recipient.name}
                          {recipient.username ? ` (${recipient.username})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {selected?.confidential ? (
                <p className='flex items-center gap-2 text-sm text-muted-foreground'>
                  <LockIcon className='size-4' aria-hidden />
                  {t('settings.confidentialLocked')}
                </p>
              ) : null}
              <DocumentError error={error} />
              <div className='flex items-center justify-between gap-3'>
                <p className='text-sm text-muted-foreground'>
                  {t('settings.shareRecipientHint')}
                </p>
                <Button
                  type='button'
                  disabled={!selected || !recipientId || busy}
                  onClick={() => void share()}
                >
                  <Share2Icon aria-hidden />
                  {busy ? t('settings.saving') : t('settings.share')}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <BookOpenIcon className='size-4' aria-hidden />
            {t('settings.activeShares')}
          </CardTitle>
          <CardDescription>
            {t('settings.activeSharesDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {documentsRequest.loading && !documentsRequest.data ? (
            <div className='flex justify-center py-8'>
              <Spinner />
            </div>
          ) : documents.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant='icon'>
                  <BookOpenIcon />
                </EmptyMedia>
                <EmptyTitle>{t('settings.noDocuments')}</EmptyTitle>
                <EmptyDescription>
                  {t('settings.noDocumentsDescription')}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className='divide-y divide-border'>
              {documents.map((document) => (
                <li
                  key={document.id}
                  className='flex flex-col gap-3 py-4 first:pt-0 last:pb-0'
                >
                  <div className='flex flex-wrap items-center gap-2'>
                    <span className='font-medium'>{document.title}</span>
                    <Badge
                      variant={document.published ? 'secondary' : 'outline'}
                    >
                      {document.published
                        ? t('documents.published')
                        : t('documents.draft')}
                    </Badge>
                    {document.confidential ? (
                      <Badge variant='destructive'>
                        <LockIcon aria-hidden />
                        {t('documents.confidential')}
                      </Badge>
                    ) : null}
                    <span className='text-sm text-muted-foreground'>
                      {t('documents.owner')}:{' '}
                      {document.ownerName || document.ownerId}
                    </span>
                  </div>
                  {document.shares.length === 0 ? (
                    <p className='text-sm text-muted-foreground'>
                      {t('settings.noShares')}
                    </p>
                  ) : (
                    <ul className='flex flex-col gap-2'>
                      {document.shares.map((person) => (
                        <li
                          key={person.userId}
                          className='flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2'
                        >
                          <span className='flex items-center gap-2 text-sm'>
                            <UsersIcon
                              className='size-4 text-muted-foreground'
                              aria-hidden
                            />
                            {person.name}
                            {person.username ? (
                              <span className='text-muted-foreground'>
                                ({person.username})
                              </span>
                            ) : null}
                          </span>
                          <Button
                            type='button'
                            size='sm'
                            variant='destructive'
                            onClick={() =>
                              setRevoking({ document, share: person })
                            }
                          >
                            <Trash2Icon aria-hidden />
                            {t('settings.revokeShare')}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ConfirmAction
        open={Boolean(revoking)}
        title={t('settings.revokeShareTitle')}
        description={
          <>
            <p>
              {t('settings.revokeShareDescription', {
                name: revoking?.share.name ?? '',
                title: revoking?.document.title ?? '',
              })}
            </p>
            <DocumentError error={error} />
          </>
        }
        confirmLabel={t('settings.revokeShare')}
        busy={busy}
        onCancel={() => setRevoking(undefined)}
        onConfirm={() => void revoke()}
      />
    </PageContainer>
  );
}
