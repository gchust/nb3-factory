import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import {
  UsersClient,
  type ManagedUser,
} from '@nocobase/app-plugin-users/client/user-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon, Share2Icon, XIcon } from 'lucide-react';
import { type ReactElement, useEffect, useReducer, useState } from 'react';

import { SessionExpiredAlert } from '#components/session-expired-alert';
import { Alert, AlertAction, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import { Field, FieldLabel } from '#components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Skeleton } from '#components/ui/skeleton';
import { Spinner } from '#components/ui/spinner';
import {
  DocumentsClient,
  type DocumentItem,
  type DocumentShare,
} from '#lib/documents-client';

import {
  DOCUMENTS_ADMIN_RESOURCE,
  DOCUMENTS_PAGE_SIZE,
} from '../documents/types.js';

/** Open one document to one reader for as long as the share exists. */
export function SharesCard(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const { can: canManage } = useCan({
    resource: DOCUMENTS_ADMIN_RESOURCE,
    action: 'manage',
  });

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const [documents, setDocuments] = useState<
    readonly DocumentItem[] | undefined
  >();
  const [users, setUsers] = useState<readonly ManagedUser[] | undefined>();
  const [error, setError] = useState<unknown>();
  const [documentId, setDocumentId] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  // The shares of the document the loaded batch was read for, or nothing while a new selection loads.
  const [shareResult, setShareResult] = useState<{
    readonly key: string;
    readonly data: readonly DocumentShare[];
  }>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const documentsClient = new DocumentsClient(api);
    const usersClient = new UsersClient(api);
    Promise.all([
      documentsClient.list({
        page: 1,
        pageSize: DOCUMENTS_PAGE_SIZE,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
        signal: controller.signal,
      }),
      usersClient.list({ page: 1, pageSize: DOCUMENTS_PAGE_SIZE }),
    ]).then(
      ([documentPage, userPage]) => {
        if (controller.signal.aborted) return;
        setDocuments(documentPage.data);
        setUsers(userPage.items);
        setError(undefined);
      },
      (caught: unknown) => {
        if (!controller.signal.aborted) setError(caught);
      },
    );
    return () => controller.abort();
  }, [api, reloadCount]);

  // Load the shares of the selected document. An empty selection loads nothing and keeps no state of its own.
  useEffect(() => {
    if (!documentId) return;
    const controller = new AbortController();
    const key = `${documentId}:${reloadCount}`;
    new DocumentsClient(api)
      .listShares(Number(documentId), controller.signal)
      .then(
        (data) => {
          if (!controller.signal.aborted) setShareResult({ key, data });
        },
        (caught: unknown) => {
          if (!controller.signal.aborted) setError(caught);
        },
      );
    return () => controller.abort();
  }, [api, documentId, reloadCount]);

  // Derive which shares belong to the current selection rather than clearing state when it empties.
  const shares: readonly DocumentShare[] | undefined =
    documentId && shareResult?.key === `${documentId}:${reloadCount}`
      ? shareResult.data
      : undefined;

  const selectedDocument = documents?.find(
    (document) => String(document.id) === documentId,
  );

  async function share(): Promise<void> {
    if (!documentId || !userId || busy) return;
    setBusy(true);
    try {
      await new DocumentsClient(api).share(Number(documentId), userId);
      toaster.show({
        type: 'success',
        title: t('settings.shares.share.success'),
      });
      setUserId('');
      reload();
    } catch (caught: unknown) {
      const status = caught instanceof ApiClientError ? caught.status : 0;
      toaster.show({
        type: 'error',
        title:
          status === 403
            ? t('documents.error.forbidden')
            : t('documents.error.requestFailed'),
      });
    } finally {
      setBusy(false);
    }
  }

  async function revoke(share: DocumentShare): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      await new DocumentsClient(api).revokeShare(
        share.documentId,
        share.userId,
      );
      toaster.show({
        type: 'success',
        title: t('settings.shares.revoke.success'),
      });
      reload();
    } catch (caught: unknown) {
      const status = caught instanceof ApiClientError ? caught.status : 0;
      toaster.show({
        type: 'error',
        title:
          status === 403
            ? t('documents.error.forbidden')
            : t('documents.error.requestFailed'),
      });
    } finally {
      setBusy(false);
    }
  }

  const documentItems = (documents ?? []).map((document) => ({
    value: String(document.id),
    label: document.title,
  }));
  const userItems = (users ?? []).map((user) => ({
    value: user.id,
    label: user.name,
  }));

  let content: ReactElement;
  if (error instanceof ApiClientError && error.status === 401) {
    content = <SessionExpiredAlert />;
  } else if (error) {
    const forbidden = error instanceof ApiClientError && error.status === 403;
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {forbidden
            ? t('documents.error.forbidden')
            : t('documents.error.requestFailed')}
        </AlertDescription>
        {forbidden ? null : (
          <AlertAction>
            <Button variant='outline' size='sm' onClick={() => reload()}>
              {t('status.retry')}
            </Button>
          </AlertAction>
        )}
      </Alert>
    );
  } else if (documents === undefined || users === undefined) {
    content = (
      <div
        role='status'
        aria-label={t('status.loading')}
        className='flex flex-col gap-3'
      >
        <Skeleton className='h-8 w-full' />
        <Skeleton className='h-24 w-full' />
      </div>
    );
  } else {
    content = (
      <>
        <div className='flex flex-wrap items-end gap-3'>
          <Field className='w-full sm:w-64'>
            <FieldLabel htmlFor='shares-document'>
              {t('settings.shares.document')}
            </FieldLabel>
            <Select
              items={documentItems}
              value={documentId || null}
              onValueChange={(value) => {
                setDocumentId(value ?? '');
                setUserId('');
              }}
            >
              <SelectTrigger id='shares-document' className='w-full'>
                <SelectValue
                  placeholder={t('settings.shares.documentPlaceholder')}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {documentItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field className='w-full sm:w-56'>
            <FieldLabel htmlFor='shares-user'>
              {t('settings.shares.user')}
            </FieldLabel>
            <Select
              items={userItems}
              value={userId || null}
              onValueChange={(value) => setUserId(value ?? '')}
            >
              <SelectTrigger id='shares-user' className='w-full'>
                <SelectValue
                  placeholder={t('settings.shares.userPlaceholder')}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {userItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Button
            type='button'
            disabled={!documentId || !userId || busy || !canManage}
            onClick={() => void share()}
          >
            {busy ? (
              <Spinner data-icon='inline-start' />
            ) : (
              <Share2Icon data-icon='inline-start' />
            )}
            {t('settings.shares.share.action')}
          </Button>
        </div>

        {selectedDocument?.confidential ? (
          <p className='text-sm text-muted-foreground'>
            {t('settings.shares.confidentialHint')}
          </p>
        ) : null}

        {!documentId ? (
          <p className='py-6 text-center text-sm text-muted-foreground'>
            {t('settings.shares.selectDocument')}
          </p>
        ) : shares === undefined ? (
          <Skeleton className='h-16 w-full' role='status' />
        ) : shares.length === 0 ? (
          <p className='py-6 text-center text-sm text-muted-foreground'>
            {t('settings.shares.empty')}
          </p>
        ) : (
          <ul className='flex flex-col divide-y rounded-lg border'>
            {shares.map((share) => (
              <li
                key={share.id}
                className='flex flex-wrap items-center justify-between gap-3 p-4'
              >
                <div className='flex flex-col gap-1'>
                  <span className='font-medium'>
                    {share.userName ?? share.userId}
                  </span>
                  <span className='text-sm text-muted-foreground'>
                    {t('settings.shares.since', {
                      date: formatDateTime(share.createdAt),
                    })}
                  </span>
                </div>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  disabled={busy || !canManage}
                  onClick={() => void revoke(share)}
                >
                  <XIcon data-icon='inline-start' />
                  {t('settings.shares.revoke.action')}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {!canManage ? (
          <p className='text-sm text-muted-foreground'>
            {t('settings.shares.readOnly')}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Share2Icon data-icon='inline-start' />
          {t('settings.shares.title')}
        </CardTitle>
        <CardDescription>{t('settings.shares.description')}</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>{content}</CardContent>
    </Card>
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
