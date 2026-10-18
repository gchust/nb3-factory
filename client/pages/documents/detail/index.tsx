import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { PencilIcon, Share2Icon } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Outlet, useNavigate, useOutletContext, useParams } from 'react-router';

import { RouteDrawer } from '#components/route-drawer';
import { StatusBadge } from '#components/status-badge';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Loading } from '#components/loading';

import { getDocument } from '../api.js';
import type {
  DocumentDetailOutletContext,
  DocumentsOutletContext,
  DocumentSummary,
} from '../types.js';

/**
 * One document, in a drawer over the list.
 *
 * The drawer is the place a document is read; editing and sharing are dialogs declared as its own child routes, so
 * they stack on it and closing them returns here. What the person may do comes from the document the server answered,
 * so a reader sees the body but no edit action.
 */
export default function DocumentDetailPage(): ReactElement {
  const api = useApiClient();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { documentId } = useParams<{ documentId: string }>();
  const { reload: reloadList } = useOutletContext<DocumentsOutletContext>();
  const [document, setDocument] = useState<DocumentSummary>();
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const { can: canShare } = useCan('unrestricted');

  // Reloading after a save: set the indicators first, then fetch. Only ever called from a user action.
  const load = useCallback(() => {
    if (!documentId) return;
    setLoading(true);
    setMissing(false);
    void getDocument(api, documentId)
      .then((row) => setDocument(row))
      .catch((error: unknown) => {
        setMissing(error instanceof ApiClientError && error.status === 404);
      })
      .finally(() => setLoading(false));
  }, [api, documentId]);

  // The first load sets state only from the request's continuation, so nothing updates in the effect body itself.
  useEffect(() => {
    if (!documentId) return;
    let cancelled = false;
    void getDocument(api, documentId)
      .then((row) => {
        if (!cancelled) {
          setDocument(row);
          setMissing(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMissing(error instanceof ApiClientError && error.status === 404);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, documentId]);

  const reloadDocument = useCallback(() => {
    load();
  }, [load]);

  const detailContext: DocumentDetailOutletContext | undefined = document
    ? { document, reloadDocument, reloadList }
    : undefined;

  if (loading || (document !== undefined && document.id !== documentId)) {
    return (
      <RouteDrawer title={t('library.detail.title')}>
        <Loading className='py-16' />
      </RouteDrawer>
    );
  }

  if (missing || !document) {
    return (
      <RouteDrawer
        title={t('library.detail.title')}
        description={t('library.detail.notFound')}
        footer={
          <Button
            variant='outline'
            onClick={() => void navigate('..', { relative: 'route' })}
          >
            {t('actions.close')}
          </Button>
        }
      />
    );
  }

  const canChange = document.canEdit;

  return (
    <>
      <RouteDrawer
        title={document.title}
        description={
          <span className='flex flex-wrap items-center gap-2'>
            <DocumentStatuses document={document} />
          </span>
        }
        footer={
          <>
            {canChange ? (
              <Button onClick={() => void navigate('edit')}>
                <PencilIcon data-icon='inline-start' />
                {t('library.actions.edit')}
              </Button>
            ) : null}
            {canShare && !document.confidential ? (
              <Button
                variant={canChange ? 'outline' : 'default'}
                onClick={() => void navigate('share')}
              >
                <Share2Icon data-icon='inline-start' />
                {t('library.actions.share')}
              </Button>
            ) : null}
          </>
        }
      >
        <article className='flex flex-col gap-6'>
          {document.shared ? (
            <Alert>
              <AlertTitle>{t('library.detail.sharedTitle')}</AlertTitle>
              <AlertDescription>
                {t('library.detail.sharedDescription')}
              </AlertDescription>
            </Alert>
          ) : null}
          {document.body ? (
            <p className='text-sm leading-7 whitespace-pre-wrap'>
              {document.body}
            </p>
          ) : (
            <p className='text-sm text-muted-foreground'>
              {t('library.detail.emptyBody')}
            </p>
          )}
          <dl className='grid grid-cols-1 gap-4 border-t pt-4 text-sm sm:grid-cols-2'>
            <div>
              <dt className='text-muted-foreground'>
                {t('library.detail.owner')}
              </dt>
              <dd>{document.ownerName ?? document.ownerId}</dd>
            </div>
            <div>
              <dt className='text-muted-foreground'>
                {t('library.detail.updatedAt')}
              </dt>
              <dd>{formatDateTime(document.updatedAt)}</dd>
            </div>
          </dl>
        </article>
      </RouteDrawer>
      {detailContext ? <Outlet context={detailContext} /> : null}
    </>
  );
}

function DocumentStatuses({
  document,
}: {
  readonly document: DocumentSummary;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <>
      {document.confidential ? (
        <StatusBadge tone='warning'>
          {t('library.status.confidential')}
        </StatusBadge>
      ) : document.published ? (
        <StatusBadge tone='success'>
          {t('library.status.published')}
        </StatusBadge>
      ) : (
        <StatusBadge tone='neutral'>{t('library.status.draft')}</StatusBadge>
      )}
      {document.shared ? (
        <StatusBadge tone='info'>{t('library.status.shared')}</StatusBadge>
      ) : null}
    </>
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
