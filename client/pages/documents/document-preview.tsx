import { useApiClient, useToaster } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { DownloadIcon, RotateCcwIcon } from 'lucide-react';
import { type ReactElement, useEffect, useReducer, useState } from 'react';
import { useParams } from 'react-router';

import { RouteDrawer } from '@/components/route-drawer';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import {
  categoryLabelKey,
  documentCenterErrorKey,
  downloadDocumentFile,
  formatDateTime,
  getDocument,
  listDocumentVersions,
  restoreDocumentVersion,
  type DocumentDetail,
  type DocumentVersion,
} from '@/lib/document-center';

/**
 * The settings item that governs the administration console. Restoring a
 * version is a `manage` action, so the preview only offers it to a user the
 * permission snapshot grants it; the server enforces the same check.
 */
const DOCUMENT_CENTER_MANAGE = {
  resource: { type: 'settings' as const, id: 'documentCenter' },
  action: 'manage' as const,
};

/**
 * The document preview, presented as a child-route drawer over the list. The
 * content is text: it is shown in place and downloaded as a file. Version
 * history shows who changed each version and, for a user who may manage the
 * document center, restores an earlier version as a new one.
 */
export default function DocumentPreviewPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const toaster = useToaster();
  const canManage = useCan(DOCUMENT_CENTER_MANAGE).can;
  const { documentId } = useParams();
  const id = Number(documentId);
  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = JSON.stringify([id, reloadCount]);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly detail?: DocumentDetail;
    readonly versions?: readonly DocumentVersion[];
    readonly error?: unknown;
  }>();
  const [pending, setPending] = useState<DocumentVersion | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    const key = JSON.stringify([id, reloadCount]);
    const controller = new AbortController();
    // The version endpoint carries each version's modifier name, so a reader
    // without the `manage` action still sees who changed a version without the
    // administrator-only account directory being requested at all.
    Promise.all([
      getDocument(api, id, controller.signal),
      listDocumentVersions(api, id, controller.signal),
    ]).then(
      ([detail, versions]) => {
        if (controller.signal.aborted) return;
        setResult({ key, detail, versions });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, id, reloadCount]);

  const loading = result?.key !== requestKey;
  const detail = loading ? undefined : result?.detail;
  const versions = loading ? undefined : result?.versions;
  const error = loading ? undefined : result?.error;

  function download(): void {
    if (!detail) return;
    downloadDocumentFile({ title: detail.title, content: detail.content });
  }

  async function confirmRestore(): Promise<void> {
    const version = pending;
    setPending(null);
    if (!version) return;
    setBusy(true);
    try {
      await restoreDocumentVersion(api, version.documentId, version.version);
      toaster.show({
        type: 'success',
        title: t('documentsAdmin.versions.restored', {
          version: version.version,
        }),
      });
      reload();
    } catch (failure) {
      toaster.show({
        type: 'error',
        title: t(`documents.error.${documentCenterErrorKey(failure)}`),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <RouteDrawer
      title={detail?.title ?? t('documents.preview.title')}
      description={t('documents.preview.description')}
      footer={
        detail ? (
          <Button onClick={download}>
            <DownloadIcon />
            {t('documents.action.download')}
          </Button>
        ) : null
      }
    >
      {error ? (
        <Alert variant='destructive'>
          <AlertTitle>
            {t(`documents.error.${documentCenterErrorKey(error)}`)}
          </AlertTitle>
        </Alert>
      ) : detail === undefined ? (
        <div
          className='space-y-3'
          role='status'
          aria-label={t('status.loading')}
        >
          <Skeleton className='h-5 w-48' />
          <Skeleton className='h-40 w-full' />
        </div>
      ) : (
        <div className='space-y-4'>
          <div className='flex flex-wrap items-center gap-2 text-sm text-muted-foreground'>
            <Badge variant='secondary'>
              {t(categoryLabelKey(detail.category))}
            </Badge>
            <span>
              {t('documents.versionValue', { version: detail.version })}
            </span>
            <span aria-hidden>·</span>
            <span>
              {t('documents.updatedAtValue', {
                date: formatDateTime(detail.updatedAt, locale),
              })}
            </span>
          </div>
          {detail.summary ? (
            <p className='text-sm text-muted-foreground'>{detail.summary}</p>
          ) : null}
          <div className='rounded-lg border bg-muted/30 p-4'>
            <p className='font-sans text-sm leading-6 whitespace-pre-wrap'>
              {detail.content}
            </p>
          </div>
          {versions && versions.length > 0 ? (
            <div className='space-y-2'>
              <Separator />
              <h2 className='font-heading text-base font-medium'>
                {t('documents.preview.versionsTitle')}
              </h2>
              <ul className='space-y-3'>
                {versions.map((version, index) => (
                  <li key={version.id} className='space-y-0.5'>
                    <div className='flex flex-wrap items-center justify-between gap-2'>
                      <span className='font-medium'>
                        {t('documents.versionValue', {
                          version: version.version,
                        })}
                      </span>
                      {index === 0 ? (
                        <span className='text-xs text-muted-foreground'>
                          {t('documentsAdmin.versions.current')}
                        </span>
                      ) : canManage ? (
                        <Button
                          variant='outline'
                          size='sm'
                          disabled={busy}
                          onClick={() => setPending(version)}
                        >
                          <RotateCcwIcon />
                          {t('documentsAdmin.versions.restore')}
                        </Button>
                      ) : null}
                    </div>
                    <p className='text-xs text-muted-foreground'>
                      {t('documents.preview.versionMeta', {
                        modifier: version.createdByName ?? '—',
                        date: formatDateTime(version.createdAt, locale),
                      })}
                    </p>
                    {version.changeNote ? (
                      <p className='text-sm'>{version.changeNote}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('documentsAdmin.versions.restoreConfirm.title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('documentsAdmin.versions.restoreConfirm.description', {
                version: pending?.version ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void confirmRestore();
              }}
            >
              {busy ? <Spinner /> : null}
              {t('documentsAdmin.versions.restore')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </RouteDrawer>
  );
}
