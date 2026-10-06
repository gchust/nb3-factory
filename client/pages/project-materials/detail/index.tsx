import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { FileList } from '../../../extensions/nocobase-file-component-ui/components/file-list.js';
import type { FileRecord } from '../../../extensions/nocobase-file-component-ui/types.js';
import { fetchMaterial, updateMaterial } from '../api.js';
import type {
  ProjectMaterial,
  ProjectMaterialDetailOutletContext,
  ProjectMaterialsOutletContext,
} from '../types.js';

/** Route `/project-materials/:materialId`: the material detail drawer. */
export default function ProjectMaterialDetailPage(): ReactElement {
  const { materialId = '' } = useParams();
  // Key by id: switching to another record (browser forward/back) starts over.
  return <ProjectMaterialDetail key={materialId} materialId={materialId} />;
}

function ProjectMaterialDetail({
  materialId,
}: {
  readonly materialId: string;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  // Callbacks the list page passes down through <Outlet context>.
  const { reload: reloadList } =
    useOutletContext<ProjectMaterialsOutletContext>();

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${materialId}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly material?: ProjectMaterial;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    // Abort when the id changes or the component unmounts, so an old response
    // never overwrites a newer one.
    const controller = new AbortController();
    const key = `${materialId}:${reloadCount}`;
    fetchMaterial(api, materialId, controller.signal).then(
      (material) => {
        if (!controller.signal.aborted) setResult({ key, material });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ key, error });
        // The record no longer exists: refresh the list behind the drawer.
        if (error instanceof ApiClientError && error.status === 404) {
          reloadList();
        }
      },
    );
    return () => controller.abort();
  }, [api, materialId, reloadCount, reloadList]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;

  // After an edit is saved, show the record the endpoint returned right away.
  const [saved, setSaved] = useState<ProjectMaterial>();
  const [gone, setGone] = useState(false);

  const notFound = gone || status === 404;
  const material = notFound ? undefined : (saved ?? result?.material);

  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );

  // Stable: the edit dialog's effect depends on these callbacks.
  const outletContext = useMemo<ProjectMaterialDetailOutletContext>(
    () => ({
      onSaved: (updated) => {
        setSaved(updated);
        reloadList();
      },
      onNotFound: () => {
        setGone(true);
        reloadList();
      },
    }),
    [reloadList],
  );

  return (
    <RouteDrawer
      title={material?.title ?? t('projectMaterials.detail.title')}
      description={
        material
          ? t('projectMaterials.detail.updatedAt', {
              date: dateFormat.format(new Date(material.updatedAt)),
            })
          : undefined
      }
      // Actions are shown only once the record has loaded.
      footer={material ? <ProjectMaterialDetailActions /> : undefined}
    >
      {notFound ? (
        <Alert variant='destructive'>
          <AlertCircleIcon />
          <AlertDescription>
            {t('projectMaterials.error.notFound')}
          </AlertDescription>
        </Alert>
      ) : status === 403 ? (
        <Alert variant='destructive'>
          <AlertCircleIcon />
          <AlertDescription>
            {t('projectMaterials.error.forbidden')}
          </AlertDescription>
        </Alert>
      ) : error ? (
        <Alert variant='destructive'>
          <AlertCircleIcon />
          <AlertDescription>
            {t('projectMaterials.error.requestFailed')}
          </AlertDescription>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setReloadCount((count) => count + 1)}
          >
            {t('status.retry')}
          </Button>
        </Alert>
      ) : !material ? (
        <div
          aria-label={t('status.loading')}
          className='space-y-3'
          role='status'
        >
          <Skeleton className='h-4 w-1/2' />
          <Skeleton className='h-24 w-full' />
        </div>
      ) : (
        <ProjectMaterialAttachments
          material={material}
          onSaved={(updated) => {
            setSaved(updated);
            reloadList();
          }}
        />
      )}

      {/* The edit dialog is a child route and stacks on the drawer. Placed
          outside the state branches, it is not unmounted when the drawer
          switches to "not found". */}
      <Outlet context={outletContext} />
    </RouteDrawer>
  );
}

/** The footer renders inside the drawer, so `useRouteOverlay()` works here. */
function ProjectMaterialDetailActions(): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  const { close, isClosing } = useRouteOverlay();

  return (
    <>
      <Button
        type='button'
        variant='outline'
        disabled={isClosing}
        onClick={() => void close()}
      >
        {t('actions.close')}
      </Button>
      {/* Edit is a child route: the button is a link that keeps the query string. */}
      <Button
        nativeButton={false}
        render={<Link to={{ pathname: 'edit', search: location.search }} />}
      >
        {t('projectMaterials.detail.edit')}
      </Button>
    </>
  );
}

function ProjectMaterialAttachments({
  material,
  onSaved,
}: {
  readonly material: ProjectMaterial;
  readonly onSaved: (material: ProjectMaterial) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  // The file being confirmed for removal; kept while the dialog closes so the
  // title does not go blank during the exit animation.
  const [pendingRemoval, setPendingRemoval] = useState<FileRecord>();
  const [removing, setRemoving] = useState(false);

  async function confirmRemoval(): Promise<void> {
    const target = pendingRemoval;
    if (!target) return;
    setRemoving(true);
    try {
      const attachmentIds = material.attachments
        .filter((attachment) => attachment.id !== target.id)
        .map((attachment) => attachment.id);
      const updated = await updateMaterial(api, material.id, {
        title: material.title,
        attachmentIds,
      });
      onSaved(updated);
      setPendingRemoval(undefined);
      toaster.show({
        type: 'success',
        title: t('projectMaterials.detail.removed'),
      });
    } catch {
      toaster.show({
        type: 'error',
        title: t('projectMaterials.detail.removeFailed'),
      });
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className='space-y-4'>
      <div className='space-y-1.5'>
        <h2 className='text-sm font-medium'>
          {t('projectMaterials.fields.attachments')}
        </h2>
        <p className='text-sm text-muted-foreground'>
          {t('projectMaterials.detail.attachmentsHint')}
        </p>
      </div>
      <FileList
        files={material.attachments}
        labels={{
          empty: t('projectMaterials.detail.noAttachments'),
          preview: t('projectMaterials.detail.preview'),
          download: t('projectMaterials.detail.download'),
          remove: t('projectMaterials.detail.remove'),
        }}
        onRemove={(file) => setPendingRemoval(file)}
      />
      <AlertDialog
        open={pendingRemoval !== undefined}
        onOpenChange={(open) => {
          // Esc, backdrop and Cancel leave the material unchanged.
          if (!open && !removing) setPendingRemoval(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('projectMaterials.detail.removeConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('projectMaterials.detail.removeConfirmDescription', {
                filename: pendingRemoval?.filename ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>
              {t('actions.cancel')}
            </AlertDialogCancel>
            {/* `AlertDialogAction` is a plain button and does not close the
                dialog, so removal runs first and closes it on success. */}
            <AlertDialogAction
              variant='destructive'
              disabled={removing}
              onClick={() => void confirmRemoval()}
            >
              {removing ? <Spinner data-icon='inline-start' /> : null}
              {t('projectMaterials.detail.remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
