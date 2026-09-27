import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { LockIcon } from 'lucide-react';
import { type ReactElement, useEffect, useState } from 'react';
import { Outlet, useParams } from 'react-router';

import { RouteDrawer } from '@/components/route-drawer';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';

import type { DocumentRecord, LibraryDetailOutletContext } from '../types.js';

type DetailState = 'loading' | 'ready' | 'unavailable' | 'error';

/**
 * The record detail, presented as a drawer addressed by `/library/:documentId`.
 * The link is stable: after temporary access is withdrawn the same URL answers
 * "unavailable" and shows no body, because the read endpoint refuses the row.
 */
export default function DocumentDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { documentId = '' } = useParams();
  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [state, setState] = useState<DetailState>('loading');

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void api
      .request<{ data: DocumentRecord }>({
        path: `library/documents/${documentId}`,
        signal: controller.signal,
      })
      .then((response) => {
        if (!active) return;
        setDocument(response.data);
        setState('ready');
      })
      .catch((cause: unknown) => {
        if (!active || controller.signal.aborted) return;
        setDocument(null);
        if (
          cause instanceof ApiClientError &&
          (cause.status === 403 || cause.status === 404)
        ) {
          setState('unavailable');
        } else {
          setState('error');
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [api, documentId]);

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
          t('library.detail.title')
        )
      }
      description={
        document
          ? document.published
            ? t('library.status.published')
            : t('library.status.draft')
          : undefined
      }
    >
      {state === 'loading' ? (
        <div className='flex items-center justify-center py-10 text-muted-foreground'>
          <Spinner />
        </div>
      ) : state === 'unavailable' ? (
        <Alert variant='destructive'>
          <LockIcon />
          <AlertTitle>{t('library.detail.unavailable.title')}</AlertTitle>
          <AlertDescription>
            {t('library.detail.unavailable.description')}
          </AlertDescription>
        </Alert>
      ) : state === 'error' || !document ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('library.error.title')}</AlertTitle>
          <AlertDescription>{t('library.error.loadFailed')}</AlertDescription>
        </Alert>
      ) : (
        <div className='space-y-4'>
          <div className='text-xs text-muted-foreground'>
            {document.ownerName ?? document.ownerId}
          </div>
          <Separator />
          <p className='text-sm leading-6 whitespace-pre-wrap'>
            {document.body && document.body.length > 0
              ? document.body
              : t('library.detail.emptyBody')}
          </p>
        </div>
      )}

      <Outlet
        context={
          {
            document,
            onSaved: (saved: DocumentRecord) => {
              setDocument(saved);
              setState('ready');
            },
          } satisfies LibraryDetailOutletContext
        }
      />
    </RouteDrawer>
  );
}
