import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { PencilIcon, RefreshCwIcon } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

import { fetchDocuments, type KnowledgeDocument } from './document-api.js';
import { EditDocumentDialog } from './edit-document-dialog.js';

const LOAD_ERROR_KEYS: Record<string, string> = {
  AUTHORIZATION_DENIED: 'knowledge.documents.errors.forbidden',
};

function describeLoadError(cause: unknown): string {
  if (cause instanceof ApiClientError && cause.reason) {
    return (
      LOAD_ERROR_KEYS[cause.reason] ?? 'knowledge.documents.errors.loadFailed'
    );
  }
  return 'knowledge.documents.errors.loadFailed';
}

/**
 * The internal document library: the page a colleague reads to verify what the
 * assistant told them, and the page a supervisor edits a title or body on.
 *
 * The list is already permission-scoped by the server — a restricted document
 * is simply absent for a colleague — so the page never has to hide a row. The
 * edit control is offered only to someone holding the `manage` grant, and the
 * endpoint checks the same grant regardless.
 */
export default function KnowledgeDocumentsPage(): ReactElement {
  const api = useApiClient();
  const { t } = useTranslation();
  const [documents, setDocuments] = useState<KnowledgeDocument[] | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<KnowledgeDocument | null>(null);
  const [reload, setReload] = useState(0);
  const { can: canManage } = useCan({
    resource: { type: 'composite', id: 'knowledge.documents' },
    action: 'manage',
  });

  useEffect(() => {
    const controller = new AbortController();
    fetchDocuments(api, controller.signal)
      .then((loaded) => {
        setDocuments(loaded);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setErrorKey(describeLoadError(cause));
      });
    return () => controller.abort();
  }, [api, reload]);

  const replaceDocument = useCallback((updated: KnowledgeDocument) => {
    setDocuments((current) =>
      current
        ? current.map((document) =>
            document.id === updated.id ? updated : document,
          )
        : current,
    );
    setEditing(null);
  }, []);

  return (
    <PageContainer>
      <PageHeader
        title={t('knowledge.documents.title')}
        description={t('knowledge.documents.description')}
      />

      {errorKey ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('knowledge.documents.errors.title')}</AlertTitle>
          <AlertDescription className='flex flex-col items-start gap-3'>
            {t(errorKey)}
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => {
                setErrorKey(null);
                setReload((value) => value + 1);
              }}
            >
              <RefreshCwIcon data-icon='inline-start' />
              {t('status.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : documents === null ? (
        <div className='flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground'>
          <Spinner />
          {t('status.loadingPage')}
        </div>
      ) : documents.length === 0 ? (
        <Alert>
          <AlertTitle>{t('knowledge.documents.emptyTitle')}</AlertTitle>
          <AlertDescription>{t('knowledge.documents.empty')}</AlertDescription>
        </Alert>
      ) : (
        <ul className='space-y-4'>
          {documents.map((document) => (
            <li
              key={document.id}
              className='rounded-xl border bg-card p-5 text-card-foreground'
            >
              <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
                <div className='min-w-0 space-y-2'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <h2 className='font-heading text-lg font-semibold tracking-tight'>
                      {document.title}
                    </h2>
                    <span className='rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground'>
                      {document.visibility === 'restricted'
                        ? t('knowledge.documents.visibility.restricted')
                        : t('knowledge.documents.visibility.public')}
                    </span>
                  </div>
                  <p className='text-sm leading-6 whitespace-pre-wrap text-muted-foreground'>
                    {document.body}
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    {t('knowledge.documents.updatedAt', {
                      date: new Date(document.updatedAt).toLocaleString(),
                    })}
                  </p>
                </div>
                {canManage ? (
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => setEditing(document)}
                  >
                    <PencilIcon data-icon='inline-start' />
                    {t('knowledge.documents.edit.action')}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <EditDocumentDialog
          document={editing}
          onClose={() => setEditing(null)}
          onSaved={replaceDocument}
        />
      ) : null}
    </PageContainer>
  );
}
