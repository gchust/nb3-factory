import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon, PencilIcon } from 'lucide-react';
import { type ReactElement, useCallback, useEffect, useState } from 'react';
import {
  Link,
  Outlet,
  useLocation,
  useOutletContext,
  useParams,
} from 'react-router';

import { BackButton } from '#components/back-button';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RouteChildPage } from '#components/route-child-page';
import { Alert, AlertAction, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Skeleton } from '#components/ui/skeleton';

import { fetchDocument } from '../api.js';
import type {
  LibraryDetailOutletContext,
  LibraryOutletContext,
} from '../context.js';
import { formatDateTime } from '../format.js';
import type { LibraryDocument } from '../types.js';
import { DocumentVisibility } from '../visibility.js';
import { DocumentShares } from './shares.js';

/**
 * Route `/library/:id` and everything declared under it: one document, as a page
 * that covers the list and keeps its search and filters behind it.
 *
 * A document the caller may not read answers `404`, whether it does not exist or
 * lies outside the caller's scope — a revoked share presents itself the same
 * way, so the page shows one "no longer available" state rather than leaking
 * that the document exists.
 */
export default function DocumentDetailPage(): ReactElement {
  const { id = '' } = useParams();
  // Key by id, so going forward or back to another document starts the page over.
  return <DocumentDetail key={id} documentId={id} />;
}

function DocumentDetail({
  documentId,
}: {
  readonly documentId: string;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();
  const { reload: reloadList } = useOutletContext<LibraryOutletContext>();
  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${documentId}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly document?: LibraryDocument;
    readonly error?: unknown;
  }>();
  // An edit returns the updated document; show it without waiting for a reload.
  const [saved, setSaved] = useState<LibraryDocument>();

  useEffect(() => {
    if (!documentId) return;
    const controller = new AbortController();
    const key = requestKey;
    fetchDocument(api, documentId).then(
      (document) => {
        if (!controller.signal.aborted) setResult({ key, document });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ key, error });
        // Out of scope now: refresh the list behind this page.
        if (error instanceof ApiClientError && error.status === 404) {
          reloadList();
        }
      },
    );
    return () => controller.abort();
  }, [api, documentId, requestKey, reloadList]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;
  const notFound = !documentId || status === 404;
  const document =
    notFound || loading ? undefined : (saved ?? result?.document);

  const onChanged = useCallback(
    (updated: LibraryDocument): void => {
      setSaved(updated);
      reloadList();
    },
    [reloadList],
  );

  return (
    <RouteChildPage>
      <PageContainer>
        <BackButton />
        <PageHeader
          title={document ? document.title : t('library.detail.title')}
          description={
            document ? (
              <span className='flex flex-wrap items-center gap-x-3 gap-y-1'>
                <span>
                  {t('library.detail.owner', { name: document.ownerName })}
                </span>
                <span>
                  {t('library.detail.updatedAt', {
                    date: formatDateTime(document.updatedAt, locale),
                  })}
                </span>
                <DocumentVisibility
                  published={document.published}
                  confidential={document.confidential}
                />
              </span>
            ) : undefined
          }
          actions={
            document?.editable ? (
              // `nativeButton={false}`: it renders an `<a>` through `Link`, and Base UI warns otherwise.
              <Button
                nativeButton={false}
                render={
                  <Link
                    to={{ pathname: 'edit', search: location.search }}
                    replace
                  />
                }
              >
                <PencilIcon />
                {t('library.edit.action')}
              </Button>
            ) : undefined
          }
        />

        {loading ? (
          <div
            role='status'
            aria-label={t('library.detail.loading')}
            className='flex flex-col gap-4'
          >
            <Skeleton className='h-4 w-1/3' />
            <Skeleton className='h-32 w-full' />
          </div>
        ) : notFound ? (
          <Alert variant='destructive'>
            <AlertCircleIcon />
            <AlertDescription>{t('library.detail.notFound')}</AlertDescription>
          </Alert>
        ) : error ? (
          <Alert variant='destructive'>
            <AlertCircleIcon />
            <AlertDescription>
              {status === 403
                ? t('library.detail.forbidden')
                : t('library.detail.error')}
            </AlertDescription>
            <AlertAction>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setReloadCount((count) => count + 1)}
              >
                {t('actions.retry')}
              </Button>
            </AlertAction>
          </Alert>
        ) : document ? (
          <>
            <article className='max-w-3xl rounded-xl border border-border bg-card p-6 text-sm leading-6 whitespace-pre-wrap text-card-foreground'>
              {document.body || (
                <span className='text-muted-foreground'>
                  {t('library.detail.emptyBody')}
                </span>
              )}
            </article>
            {document.canShare ? <DocumentShares document={document} /> : null}
          </>
        ) : null}

        {/* The edit dialog is declared under this route; it opens with the document that is on screen. */}
        {document ? (
          <Outlet
            context={
              { document, onChanged } satisfies LibraryDetailOutletContext
            }
          />
        ) : null}
      </PageContainer>
    </RouteChildPage>
  );
}
