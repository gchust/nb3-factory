import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { LockIcon } from 'lucide-react';
import { type ReactElement, useEffect, useState } from 'react';
import { useParams } from 'react-router';

import { RouteDrawer } from '@/components/route-drawer';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';

import { fetchDocument } from './api.js';
import type { LibraryDocument } from './types.js';

type DetailStatus = 'loading' | 'ready' | 'unavailable' | 'error';

interface DetailState {
  /** The document id this state belongs to, so a stale answer never renders. */
  readonly id: number;
  readonly status: DetailStatus;
  readonly document: LibraryDocument | null;
}

function formatTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function DetailRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactElement | string;
}): ReactElement {
  return (
    <div className='flex items-start justify-between gap-6 text-sm'>
      <span className='text-muted-foreground'>{label}</span>
      <span className='text-right'>{children}</span>
    </div>
  );
}

function isUnavailable(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    (error.status === 403 || error.status === 404)
  );
}

/**
 * One document at a stable URL, `/documents/:documentId`.
 *
 * The URL is the point: a reader can be sent straight to a single temporarily
 * opened draft, and after that opening is revoked the same URL answers
 * "unavailable" and shows no body, because the read endpoint refuses the row.
 * A draft the reader never had access to answers the same way, so the existence
 * of a document is not leaked.
 */
export default function DocumentDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { documentId = '' } = useParams();
  const requestedId = Number(documentId);
  const [state, setState] = useState<DetailState>({
    id: 0,
    status: 'loading',
    document: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void fetchDocument(api, requestedId, controller.signal).then(
      (record) => {
        if (active) {
          setState({ id: requestedId, status: 'ready', document: record });
        }
      },
      (error: unknown) => {
        if (active && !controller.signal.aborted) {
          setState({
            id: requestedId,
            status: isUnavailable(error) ? 'unavailable' : 'error',
            document: null,
          });
        }
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [api, requestedId]);

  // A state object left over from another document is not this URL's answer.
  const status: DetailStatus =
    state.id === requestedId ? state.status : 'loading';
  const document = state.id === requestedId ? state.document : null;

  return (
    <RouteDrawer
      title={
        document ? (
          <span className='flex items-center gap-2'>
            {document.title}
            {document.confidential ? (
              <Badge variant='destructive'>
                <LockIcon />
                {t('library.status.confidential')}
              </Badge>
            ) : null}
          </span>
        ) : (
          t('library.view.title')
        )
      }
      description={
        document
          ? document.published
            ? t('library.status.published')
            : t('library.status.draft')
          : t('library.view.description')
      }
    >
      {status === 'loading' ? (
        <div className='flex items-center justify-center py-10 text-muted-foreground'>
          <Spinner />
        </div>
      ) : status === 'unavailable' ? (
        <Alert variant='destructive'>
          <LockIcon />
          <AlertTitle>{t('library.detail.unavailableTitle')}</AlertTitle>
          <AlertDescription>
            {t('library.detail.unavailableDescription')}
          </AlertDescription>
        </Alert>
      ) : status === 'error' || !document ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('library.loadFailed')}</AlertTitle>
          <AlertDescription>
            {t('library.loadFailedDescription')}
          </AlertDescription>
        </Alert>
      ) : (
        <div className='space-y-4'>
          <div className='flex flex-wrap gap-2'>
            <Badge variant={document.published ? 'default' : 'outline'}>
              {document.published
                ? t('library.status.published')
                : t('library.status.draft')}
            </Badge>
            {document.confidential ? (
              <Badge variant='destructive'>
                {t('library.status.confidential')}
              </Badge>
            ) : null}
            {!document.canEdit ? (
              <Badge variant='secondary'>{t('library.view.readOnly')}</Badge>
            ) : null}
          </div>
          <Separator />
          <DetailRow label={t('library.columns.owner')}>
            {document.ownerName ?? document.ownerId}
          </DetailRow>
          <DetailRow label={t('library.view.created')}>
            {formatTime(document.createdAt)}
          </DetailRow>
          <DetailRow label={t('library.view.updated')}>
            {formatTime(document.updatedAt)}
          </DetailRow>
          <Separator />
          <div className='space-y-2'>
            <h3 className='text-sm font-medium'>{t('library.view.body')}</h3>
            <p className='text-sm leading-6 whitespace-pre-wrap text-foreground'>
              {document.content?.trim()
                ? document.content
                : t('library.view.emptyBody')}
            </p>
          </div>
        </div>
      )}
    </RouteDrawer>
  );
}
