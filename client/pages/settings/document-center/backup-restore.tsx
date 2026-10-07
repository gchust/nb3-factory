import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { HistoryIcon } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import {
  documentCenterErrorKey,
  getBackupImpact,
  restoreBackup,
  type BackupImpact,
  type BackupImpactAction,
} from '@/lib/document-center';

/** The impact table is ordered from the most invasive change to the least. */
const ACTION_ORDER: readonly BackupImpactAction[] = [
  'delete',
  'create',
  'update',
  'restore',
  'unchanged',
];

/** The `:backupId/restore` child route: what a restore would change, then the confirmed restore. */
export default function BackupRestorePage(): ReactElement {
  const { t } = useTranslation();
  return (
    <RouteDialog
      title={t('documentsAdmin.backupRestore.title')}
      description={t('documentsAdmin.backupRestore.description')}
    >
      <BackupRestoreContent />
    </RouteDialog>
  );
}

/**
 * The overlay's content. `useRouteOverlay` reads the context the enclosing
 * `RouteDialog` provides, so it must be called here — a component rendered
 * inside the dialog — and never in the page that renders the dialog.
 */
function BackupRestoreContent(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<{ readonly reload: () => void }>();
  const { backupId } = useParams();
  const id = Number(backupId);

  const [result, setResult] = useState<{
    readonly key: number;
    readonly impact?: BackupImpact;
    readonly error?: unknown;
  }>();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    const controller = new AbortController();
    getBackupImpact(api, id, controller.signal).then(
      (impact) => {
        if (!controller.signal.aborted) setResult({ key: id, impact });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key: id, error });
      },
    );
    return () => controller.abort();
  }, [api, id]);

  const loading = result?.key !== id;
  const impact = loading ? undefined : result?.impact;
  const error = loading ? undefined : result?.error;

  async function confirm(): Promise<void> {
    setConfirming(false);
    setBusy(true);
    try {
      const restored = await restoreBackup(api, id);
      toaster.show({
        type: 'success',
        title: t('documentsAdmin.backupRestore.restored', {
          count: restored.documents,
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

  const changed = impact
    ? impact.documents.filter((entry) => entry.action !== 'unchanged')
    : [];

  return (
    <>
      {error ? (
        <Alert variant='destructive'>
          <AlertTitle>
            {t(`documents.error.${documentCenterErrorKey(error)}`)}
          </AlertTitle>
        </Alert>
      ) : impact === undefined ? (
        <div
          className='space-y-3'
          role='status'
          aria-label={t('status.loading')}
        >
          <Skeleton className='h-10 w-full' />
          <Skeleton className='h-32 w-full' />
        </div>
      ) : (
        <div className='space-y-4'>
          <div className='flex flex-wrap gap-2'>
            {ACTION_ORDER.map((action) => (
              <Badge
                key={action}
                variant={action === 'unchanged' ? 'outline' : 'secondary'}
              >
                {t(`documentsAdmin.backupAction.${action}`)}:{' '}
                {impact.summary[action]}
              </Badge>
            ))}
          </div>

          {changed.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('documentsAdmin.backupRestore.noChanges')}
            </p>
          ) : (
            <div className='overflow-hidden rounded-lg border'>
              <table className='w-full text-sm'>
                <thead className='bg-muted/40 text-left'>
                  <tr>
                    <th className='px-3 py-2 font-medium'>
                      {t('documentsAdmin.backupRestore.column.document')}
                    </th>
                    <th className='px-3 py-2 font-medium'>
                      {t('documentsAdmin.backupRestore.column.action')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {changed.map((entry) => (
                    <tr
                      key={
                        entry.documentId !== null
                          ? String(entry.documentId)
                          : `new:${entry.code ?? entry.title}`
                      }
                      className='border-t'
                    >
                      <td className='px-3 py-2'>
                        <span className='font-medium'>{entry.title}</span>
                        {entry.code ? (
                          <span className='ml-2 font-mono text-xs text-muted-foreground'>
                            {entry.code}
                          </span>
                        ) : null}
                      </td>
                      <td className='px-3 py-2'>
                        {t(`documentsAdmin.backupAction.${entry.action}`)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className='flex justify-end gap-2'>
            <Button
              type='button'
              variant='outline'
              onClick={() => {
                void close();
              }}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              variant='destructive'
              disabled={busy}
              onClick={() => setConfirming(true)}
            >
              {busy ? <Spinner /> : <HistoryIcon />}
              {t('documentsAdmin.backupRestore.confirm')}
            </Button>
          </div>

          <AlertDialog open={confirming} onOpenChange={setConfirming}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t('documentsAdmin.backupRestore.confirmTitle')}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t('documentsAdmin.backupRestore.confirmDescription', {
                    count: changed.length,
                  })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  variant='destructive'
                  onClick={() => {
                    void confirm();
                  }}
                >
                  {t('documentsAdmin.backupRestore.confirm')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </>
  );
}
