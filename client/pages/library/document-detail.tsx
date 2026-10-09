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

import { DocumentDeleteDialog } from './document-delete-dialog.js';
import { DocumentFlags } from './document-flags.js';
import type {
  LibraryDocument,
  LibraryEditOutletContext,
  LibraryOutletContext,
} from './types.js';

/** Route `/library/:documentId`: the document detail drawer. */
export default function DocumentDetailPage(): ReactElement {
  const { documentId = '' } = useParams();
  // Key by id: when forward or back switches to another record, the drawer's
  // state starts over.
  return <DocumentDetail key={documentId} documentId={documentId} />;
}

function DocumentDetail({
  documentId,
}: {
  readonly documentId: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  // Functions of the page behind the drawer, through <Outlet context>.
  const { reload: reloadPage, afterDelete } =
    useOutletContext<LibraryOutletContext>();

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${documentId}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly document?: LibraryDocument;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = `${documentId}:${reloadCount}`;
    api
      .request<{ data: LibraryDocument }>({
        path: `library/documents/${encodeURIComponent(documentId)}`,
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setResult({ key, document: data });
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          setResult({ key, error });
          // The record no longer exists (or is no longer shared with the
          // caller): the page behind may still show it, so refresh that page.
          if (error instanceof ApiClientError && error.status === 404) {
            reloadPage();
          }
        },
      );
    return () => controller.abort();
  }, [api, documentId, reloadCount, reloadPage]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;

  // After an edit is saved, show the record the endpoint returned right away
  // instead of waiting for a reload.
  const [saved, setSaved] = useState<LibraryDocument>();
  // The edit dialog found that the record no longer exists.
  const [gone, setGone] = useState(false);

  const notFound = gone || status === 404;
  const document = notFound ? undefined : (saved ?? result?.document);

  // The edit dialog (child route edit) gets these two callbacks through
  // <Outlet context>. Keep them stable with useMemo: the dialog's loading
  // effect depends on them.
  const outletContext = useMemo<LibraryEditOutletContext>(
    () => ({
      onSaved: (updated) => {
        setSaved(updated);
        reloadPage();
      },
      onNotFound: () => {
        setGone(true);
        reloadPage();
      },
    }),
    [reloadPage],
  );

  let body: ReactElement;
  if (status === 401) {
    body = <SessionExpiredAlert />;
  } else if (notFound || status === 403) {
    // A retry will not succeed either, so only explain the situation.
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
      // Show no record actions before the record has loaded or when it does
      // not exist.
      footer={
        document ? (
          <DocumentDetailActions document={document} onDeleted={afterDelete} />
        ) : undefined
      }
    >
      {body}
      {/* The edit dialog (child route edit) renders inside the drawer,
          stacked on it; placed outside the state branches, it is not
          unmounted when the drawer switches state. */}
      <Outlet context={outletContext} />
    </RouteDrawer>
  );
}

/**
 * Record actions at the bottom of the drawer. The footer renders inside the
 * drawer, so useRouteOverlay() can be called here. A record the caller may
 * not edit or delete shows no button at all.
 */
function DocumentDetailActions({
  document,
  onDeleted,
}: {
  readonly document: LibraryDocument;
  readonly onDeleted: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  const { close } = useRouteOverlay();
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (!document.canEdit && !document.canDelete) {
    return <></>;
  }

  return (
    <>
      {document.canDelete ? (
        <Button variant='destructive' onClick={() => setDeleteOpen(true)}>
          {t('library.actions.delete')}
        </Button>
      ) : null}
      {document.canEdit ? (
        // Edit is a child route: the button renders as a link that keeps the
        // query parameters, so the state of the page behind stays the same.
        <Button
          nativeButton={false}
          render={<Link to={{ pathname: 'edit', search: location.search }} />}
        >
          {t('library.actions.edit')}
        </Button>
      ) : null}
      {/* The delete confirmation uses component state. On success, first let
          the page refresh and arrange focus, then close the drawer. */}
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
  readonly document: LibraryDocument;
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
    <div className='flex flex-col gap-4 text-sm'>
      <dl className='grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3'>
        <dt className='text-muted-foreground'>{t('library.fields.owner')}</dt>
        {/* Long text without spaces still wraps instead of widening the drawer. */}
        <dd className='min-w-0 wrap-anywhere'>
          {document.ownerName ?? document.ownerId}
        </dd>
        <dt className='text-muted-foreground'>
          {t('library.fields.visibility')}
        </dt>
        <dd>
          <DocumentFlags
            published={document.published}
            confidential={document.confidential}
          />
        </dd>
        <dt className='text-muted-foreground'>
          {t('library.fields.updatedAt')}
        </dt>
        <dd>{dateFormat.format(new Date(document.updatedAt))}</dd>
      </dl>
      <div className='flex flex-col gap-2'>
        <span className='text-muted-foreground'>
          {t('library.fields.body')}
        </span>
        {document.body ? (
          <p className='min-w-0 whitespace-pre-wrap wrap-anywhere'>
            {document.body}
          </p>
        ) : (
          <p className='text-muted-foreground'>—</p>
        )}
      </div>
    </div>
  );
}
