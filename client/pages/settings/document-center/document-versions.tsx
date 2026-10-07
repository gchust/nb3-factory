import { useApiClient, useToaster } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { RotateCcwIcon } from 'lucide-react';
import { type ReactElement, useEffect, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';
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
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import {
  categoryLabelKey,
  documentCenterErrorKey,
  formatDateTime,
  listDocumentVersions,
  restoreDocumentVersion,
  type DocumentVersion,
} from '@/lib/document-center';

import type { DocumentListOutletContext } from './document-form.js';

/**
 * The `:documentId/versions` child route: the full version history with who
 * changed it and when, and the action that restores an earlier version as a
 * new version.
 */
export default function DocumentVersionsPage(): ReactElement {
  const { t } = useTranslation();
  return (
    <RouteDialog
      title={t('documentsAdmin.versions.title')}
      description={t('documentsAdmin.versions.description')}
    >
      <DocumentVersionsContent />
    </RouteDialog>
  );
}

/**
 * The overlay's content. `useRouteOverlay` reads the context the enclosing
 * `RouteDialog` provides, so it must be called here — a component rendered
 * inside the dialog — and never in the page that renders the dialog.
 */
function DocumentVersionsContent(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const toaster = useToaster();
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<DocumentListOutletContext>();
  const { documentId } = useParams();
  const id = Number(documentId);

  const [result, setResult] = useState<{
    readonly key: number;
    readonly versions?: readonly DocumentVersion[];
    readonly error?: unknown;
  }>();
  const [pending, setPending] = useState<DocumentVersion | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    const controller = new AbortController();
    // The version endpoint carries each version's modifier name, so the
    // administrator-only account directory is never requested here.
    listDocumentVersions(api, id, controller.signal).then(
      (versions) => {
        if (controller.signal.aborted) return;
        setResult({ key: id, versions });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key: id, error });
      },
    );
    return () => controller.abort();
  }, [api, id]);

  const loading = result?.key !== id;
  const versions = loading ? undefined : result?.versions;
  const error = loading ? undefined : result?.error;

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
      await close();
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
    <>
      {error ? (
        <Alert variant='destructive'>
          <AlertTitle>
            {t(`documents.error.${documentCenterErrorKey(error)}`)}
          </AlertTitle>
        </Alert>
      ) : versions === undefined ? (
        <div
          className='space-y-3'
          role='status'
          aria-label={t('status.loading')}
        >
          <Skeleton className='h-10 w-full' />
          <Skeleton className='h-10 w-full' />
        </div>
      ) : (
        <ol className='space-y-3'>
          {versions.map((version, index) => (
            <li key={version.id} className='space-y-2'>
              {index > 0 ? <Separator /> : null}
              <div className='flex flex-wrap items-start justify-between gap-2'>
                <div className='space-y-0.5'>
                  <p className='font-medium'>
                    {t('documents.versionValue', {
                      version: version.version,
                    })}
                  </p>
                  <p className='text-sm text-muted-foreground'>
                    {t('documentsAdmin.versions.meta', {
                      category: t(categoryLabelKey(version.category)),
                      modifier: version.createdByName ?? '—',
                      date: formatDateTime(version.createdAt, locale),
                    })}
                  </p>
                  {version.changeNote ? (
                    <p className='text-sm'>{version.changeNote}</p>
                  ) : null}
                </div>
                {index === 0 ? (
                  <span className='text-xs text-muted-foreground'>
                    {t('documentsAdmin.versions.current')}
                  </span>
                ) : (
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={busy}
                    onClick={() => setPending(version)}
                  >
                    <RotateCcwIcon />
                    {t('documentsAdmin.versions.restore')}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ol>
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
    </>
  );
}
