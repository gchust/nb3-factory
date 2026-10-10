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
import { useRouteOverlay } from '@/components/use-route-overlay';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import { LibraryDocumentDeleteDialog } from '../library-document-delete-dialog.js';
import { fetchLibraryDocument } from '../library-api.js';
import { LibraryDocumentBadges } from '../status-badges.js';
import type {
  LibraryDocument,
  LibraryEditOutletContext,
  LibraryListOutletContext,
} from '../types.js';
import { useLibraryPermissions } from '../use-library-permissions.js';

/**
 * One document in a drawer. It reads the callbacks of the page it opened over
 * and passes its own callbacks to the edit dialog declared under it, so the
 * same module works over the list and any other page that declares it.
 */
export default function LibraryDocumentDrawerPage(): ReactElement {
  const { documentId = '' } = useParams();
  return <LibraryDocumentDrawer key={documentId} documentId={documentId} />;
}

function LibraryDocumentDrawer({
  documentId,
}: {
  readonly documentId: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const {
    afterDelete,
    reload: reloadList,
    onNotFound,
  } = useOutletContext<LibraryListOutletContext>();

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
    fetchLibraryDocument(api, documentId, controller.signal).then(
      (document) => {
        if (!controller.signal.aborted) setResult({ key, document });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ key, error });
        if (error instanceof ApiClientError && error.status === 404) {
          onNotFound();
          reloadList();
        }
      },
    );
    return () => controller.abort();
  }, [api, documentId, onNotFound, reloadList, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;
  const doc = loading ? undefined : result?.document;

  const editContext = useMemo<LibraryEditOutletContext>(
    () => ({
      onSaved: () => {
        setReloadCount((count) => count + 1);
        reloadList();
      },
      onNotFound: () => {
        onNotFound();
      },
    }),
    [onNotFound, reloadList],
  );

  let body: ReactElement;
  if (status === 403) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('library.error.forbidden')}</AlertDescription>
      </Alert>
    );
  } else if (status === 404) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('library.error.notFound')}</AlertDescription>
      </Alert>
    );
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('library.error.requestFailed')}</AlertDescription>
        <AlertAction>
          <Button
            onClick={() => setReloadCount((count) => count + 1)}
            size='sm'
            variant='outline'
          >
            {t('status.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (!doc) {
    body = (
      <div
        aria-label={t('status.loading')}
        className='flex flex-col gap-3'
        role='status'
      >
        <Skeleton className='h-4 w-1/2' />
        <Skeleton className='h-4 w-1/3' />
        <Skeleton className='h-4 w-2/3' />
      </div>
    );
  } else {
    body = <LibraryDocumentFields document={doc} />;
  }

  return (
    <RouteDrawer
      footer={
        doc ? (
          <LibraryDocumentActions
            document={doc}
            onDeleted={() => {
              afterDelete();
            }}
          />
        ) : undefined
      }
      title={doc?.title ?? t('library.detail.title')}
    >
      {body}
      {/* The edit dialog (child route) stacks on the drawer; outside the state branches it is not unmounted when the drawer switches state. */}
      <Outlet context={editContext} />
    </RouteDrawer>
  );
}

/** Record actions in the drawer footer; inside the overlay, so useRouteOverlay() is available. */
function LibraryDocumentActions({
  document: doc,
  onDeleted,
}: {
  readonly document: LibraryDocument;
  readonly onDeleted: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  const { close } = useRouteOverlay();
  const { canDelete, canEdit } = useLibraryPermissions();
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      {canDelete ? (
        <Button variant='destructive' onClick={() => setDeleteOpen(true)}>
          {t('library.actions.delete')}
        </Button>
      ) : null}
      {canEdit ? (
        <Button
          nativeButton={false}
          render={<Link to={{ pathname: 'edit', search: location.search }} />}
        >
          {t('library.actions.edit')}
        </Button>
      ) : null}
      <LibraryDocumentDeleteDialog
        document={doc}
        onDeleted={() => {
          onDeleted();
          void close();
        }}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
      />
    </>
  );
}

function LibraryDocumentFields({
  document: doc,
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
        <dd className='min-w-0 wrap-anywhere'>{doc.ownerName ?? '—'}</dd>
        <dt className='text-muted-foreground'>{t('library.fields.status')}</dt>
        <dd>
          <LibraryDocumentBadges
            confidential={doc.confidential}
            published={doc.published}
          />
        </dd>
        <dt className='text-muted-foreground'>
          {t('library.fields.updatedAt')}
        </dt>
        <dd>{dateFormat.format(new Date(doc.updatedAt))}</dd>
      </dl>
      <div className='flex flex-col gap-1.5'>
        <span className='text-muted-foreground'>
          {t('library.fields.content')}
        </span>
        <div className='rounded-lg border border-border bg-muted/30 p-3 whitespace-pre-wrap wrap-anywhere'>
          {doc.content?.trim() ? doc.content : t('library.detail.emptyContent')}
        </div>
      </div>
    </div>
  );
}
