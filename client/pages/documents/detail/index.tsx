import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import {
  Link,
  Outlet,
  useLocation,
  useOutletContext,
  useParams,
} from 'react-router';

import { RouteDrawer } from '@/components/route-drawer';
import { SessionExpiredAlert } from '@/components/session-expired-alert';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { DocumentDeleteDialog } from '../document-delete-dialog.js';
import type {
  Document,
  DocumentEditOutletContext,
  DocumentsOutletContext,
} from '../types.js';

/** Route `/documents/:documentId`: the document detail drawer. */
export default function DocumentDetailPage(): ReactElement {
  const { documentId = '' } = useParams();
  // Key by id so state starts over when forward or back switches to another record.
  return <DocumentDetail key={documentId} documentId={documentId} />;
}

function DocumentDetail({
  documentId,
}: {
  readonly documentId: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { afterDelete, reload: reloadList } =
    useOutletContext<DocumentsOutletContext>();

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${documentId}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly document?: Document;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = `${documentId}:${reloadCount}`;
    api
      .request<{ data: Document }>({
        path: `documents/${encodeURIComponent(documentId)}`,
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setResult({ key, document: data });
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          setResult({ key, error });
        },
      );
    return () => controller.abort();
  }, [api, documentId, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;

  const [saved, setSaved] = useState<Document>();
  const [gone, setGone] = useState(false);

  const notFound = gone || status === 404;
  const document = notFound ? undefined : (saved ?? result?.document);

  const outletContext = useMemo<DocumentEditOutletContext>(
    () => ({
      onSaved: (updated) => {
        setSaved(updated);
        reloadList();
      },
      onNotFound: () => {
        setGone(true);
        afterDelete();
      },
    }),
    [afterDelete, reloadList],
  );

  let body: ReactElement;
  if (status === 401) {
    body = <SessionExpiredAlert />;
  } else if (notFound || status === 403) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {notFound
            ? t('library.error.notFound')
            : t('library.error.forbidden')}
        </AlertDescription>
      </Alert>
    );
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('library.error.requestFailed')}</AlertDescription>
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
  } else if (!document) {
    body = (
      <div
        role='status'
        aria-label={t('status.loading')}
        className='flex flex-col gap-3'
      >
        <Skeleton className='h-4 w-1/2' />
        <Skeleton className='h-4 w-1/3' />
        <Skeleton className='h-4 w-2/3' />
      </div>
    );
  } else {
    body = <DocumentFields document={document} />;
  }

  return (
    <RouteDrawer
      title={document?.title ?? t('library.detail.title')}
      footer={
        document ? (
          <DocumentDetailActions document={document} onDeleted={afterDelete} />
        ) : undefined
      }
    >
      {body}
      {/* The edit dialog stacks on the drawer, placed outside the state branches. */}
      <Outlet context={outletContext} />
    </RouteDrawer>
  );
}

function DocumentDetailActions({
  document,
  onDeleted,
}: {
  readonly document: Document;
  readonly onDeleted: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  const { close } = useRouteOverlay();
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <Button variant='destructive' onClick={() => setDeleteOpen(true)}>
        {t('library.actions.delete')}
      </Button>
      {/* Edit is a child route; the link keeps the list's query parameters. */}
      <Button
        nativeButton={false}
        render={<Link to={{ pathname: 'edit', search: location.search }} />}
      >
        {t('library.actions.edit')}
      </Button>
      <DocumentDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        document={document}
        onDeleted={() => {
          onDeleted();
          void close();
        }}
      />
    </>
  );
}

function DocumentFields({
  document,
}: {
  readonly document: Document;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );
  return (
    <dl className='grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3 text-sm'>
      <dt className='text-muted-foreground'>{t('library.fields.code')}</dt>
      <dd className='min-w-0 wrap-anywhere'>{document.code}</dd>
      <dt className='text-muted-foreground'>{t('library.fields.owner')}</dt>
      <dd className='min-w-0 wrap-anywhere'>{document.ownerName ?? '—'}</dd>
      <dt className='text-muted-foreground'>{t('library.fields.published')}</dt>
      <dd>{t(document.published ? 'library.flag.yes' : 'library.flag.no')}</dd>
      <dt className='text-muted-foreground'>
        {t('library.fields.confidential')}
      </dt>
      <dd>
        {t(document.confidential ? 'library.flag.yes' : 'library.flag.no')}
      </dd>
      <dt className='text-muted-foreground'>{t('library.fields.body')}</dt>
      {/* Long text without spaces still wraps instead of widening the drawer. */}
      <dd className='min-w-0 whitespace-pre-wrap wrap-anywhere'>
        {document.body ? document.body : '—'}
      </dd>
      <dt className='text-muted-foreground'>{t('library.fields.updatedAt')}</dt>
      <dd>
        {document.updatedAt
          ? dateFormat.format(new Date(document.updatedAt))
          : '—'}
      </dd>
    </dl>
  );
}
