import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import {
  Link,
  Outlet,
  useLocation,
  useOutletContext,
  useParams,
} from 'react-router';

import { RouteDrawer } from '#components/route-drawer';
import { SessionExpiredAlert } from '#components/session-expired-alert';
import { StatusBadge } from '#components/status-badge';
import { Alert, AlertAction, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Skeleton } from '#components/ui/skeleton';
import { useRouteOverlay } from '#components/use-route-overlay';
import { DocumentsClient, type DocumentItem } from '#lib/documents-client';

import { DocumentDeleteDialog } from '../document-delete-dialog.js';
import {
  parseDocumentId,
  type DocumentEditContext,
  type DocumentsListContext,
} from '../types.js';

/**
 * `/documents/:documentId` — one document in a drawer over the list. A reader who holds a link to a document they may
 * no longer see (a revoked share, a confidential document, a deleted record) gets the same "unavailable" message that
 * reading it again produces, never the record.
 */
export default function DocumentDetailPage(): ReactElement {
  const { documentId = '' } = useParams();
  return <DocumentDetail key={documentId} documentId={documentId} />;
}

function DocumentDetail({
  documentId,
}: {
  readonly documentId: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { reload } = useOutletContext<DocumentsListContext>();

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${documentId}:${reloadCount}`;
  const id = parseDocumentId(documentId);
  // Set when the stacked edit dialog reports the record gone; a URL that never named a usable id is not state.
  const [reportedMissing, setReportedMissing] = useState(false);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly document?: DocumentItem;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    if (id === undefined) return;
    const controller = new AbortController();
    const key = `${documentId}:${reloadCount}`;
    new DocumentsClient(api).get(id, controller.signal).then(
      (document) => {
        if (!controller.signal.aborted) setResult({ key, document });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, documentId, id, reloadCount]);

  const loading = id !== undefined && result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;
  const notFound = id === undefined || reportedMissing || status === 404;
  const document = loading ? undefined : result?.document;

  // The edit dialog stacked on this drawer reports back here: it refreshes the visible record and the list behind.
  const editContext: DocumentEditContext = useMemo(
    () => ({
      onSaved: (saved) => {
        setResult((previous) =>
          previous ? { ...previous, document: saved } : previous,
        );
        reload();
      },
      onNotFound: () => {
        setReportedMissing(true);
        reload();
      },
    }),
    [reload],
  );

  let body: ReactElement;
  let footer: ReactElement | undefined;
  if (loading) {
    body = (
      <div
        role='status'
        aria-label={t('status.loading')}
        className='flex flex-col gap-5'
      >
        {['owner', 'updatedAt', 'body'].map((field) => (
          <div key={field} className='flex flex-col gap-2'>
            <Skeleton className='h-4 w-16' />
            <Skeleton className='h-8 w-full' />
          </div>
        ))}
      </div>
    );
    footer = <CloseButton label={t('actions.close')} />;
  } else if (status === 401) {
    body = <SessionExpiredAlert />;
    footer = <CloseButton label={t('actions.close')} />;
  } else if (notFound) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {t('documents.detail.missing.description')}
        </AlertDescription>
      </Alert>
    );
    footer = <CloseButton label={t('actions.close')} />;
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {t('documents.error.requestFailed')}
        </AlertDescription>
        <AlertAction>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setReloadCount((count) => count + 1)}
          >
            {t('status.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
    footer = <CloseButton label={t('actions.close')} />;
  } else if (!document) {
    body = <div />;
  } else {
    body = <DocumentDetails document={document} />;
    footer = <DocumentDetailActions document={document} onDeleted={reload} />;
  }

  return (
    <RouteDrawer
      title={document ? document.title : t('documents.detail.title')}
      description={t('documents.detail.description')}
      footer={footer}
    >
      {body}
      <Outlet context={editContext} />
    </RouteDrawer>
  );
}

function DocumentDetails({
  document,
}: {
  readonly document: DocumentItem;
}): ReactElement {
  const { t } = useTranslation();
  const rows: readonly {
    readonly label: string;
    readonly value: ReactElement | string;
  }[] = [
    {
      label: t('documents.fields.owner'),
      value: document.ownerName ?? t('documents.detail.unknownOwner'),
    },
    {
      label: t('documents.fields.published'),
      value: (
        <StatusBadge tone={document.published ? 'success' : 'neutral'}>
          {document.published
            ? t('documents.status.published')
            : t('documents.status.draft')}
        </StatusBadge>
      ),
    },
    {
      label: t('documents.fields.confidential'),
      value: document.confidential ? (
        <StatusBadge tone='warning'>
          {t('documents.status.confidential')}
        </StatusBadge>
      ) : (
        t('documents.status.normal')
      ),
    },
    {
      label: t('documents.fields.updatedAt'),
      value: formatDateTime(document.updatedAt),
    },
  ];

  return (
    <div className='flex flex-col gap-6'>
      <dl className='grid grid-cols-[minmax(5rem,auto)_1fr] gap-x-4 gap-y-3 text-sm'>
        {rows.map((row) => (
          <div key={row.label} className='contents'>
            <dt className='text-muted-foreground'>{row.label}</dt>
            <dd className='min-w-0 break-words'>{row.value}</dd>
          </div>
        ))}
      </dl>
      <section className='flex flex-col gap-2'>
        <h3 className='text-sm font-medium'>{t('documents.fields.body')}</h3>
        {document.body ? (
          <p className='text-sm leading-6 whitespace-pre-wrap text-foreground'>
            {document.body}
          </p>
        ) : (
          <p className='text-sm text-muted-foreground'>
            {t('documents.detail.emptyBody')}
          </p>
        )}
      </section>
    </div>
  );
}

/** The drawer's own actions, inside `RouteDrawer` so `useRouteOverlay` can close it. */
function DocumentDetailActions({
  document,
  onDeleted,
}: {
  readonly document: DocumentItem;
  readonly onDeleted: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  const { close } = useRouteOverlay();
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <div className='flex justify-end gap-2'>
      {document.canEdit ? (
        <Button
          type='button'
          variant='outline'
          nativeButton={false}
          render={<Link to={{ pathname: 'edit', search: location.search }} />}
        >
          <PencilIcon data-icon='inline-start' />
          {t('documents.rowActions.edit')}
        </Button>
      ) : null}
      {document.canDelete ? (
        <Button
          type='button'
          variant='destructive'
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2Icon data-icon='inline-start' />
          {t('documents.rowActions.delete')}
        </Button>
      ) : null}
      <Button type='button' variant='outline' onClick={() => void close()}>
        {t('actions.close')}
      </Button>
      <DocumentDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        document={document}
        onDeleted={() => {
          setDeleteOpen(false);
          onDeleted();
          void close();
        }}
      />
    </div>
  );
}

function CloseButton({ label }: { readonly label: string }): ReactElement {
  const { close, isClosing } = useRouteOverlay();
  return (
    <div className='flex justify-end'>
      <Button
        type='button'
        variant='outline'
        disabled={isClosing}
        onClick={() => void close()}
      >
        {label}
      </Button>
    </div>
  );
}

/** A locale-aware date and time; an unparsable value falls back to the raw string. */
function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}
