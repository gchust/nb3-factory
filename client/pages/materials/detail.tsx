import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { CircleAlert } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link, Outlet, useOutletContext, useParams } from 'react-router';

import { RouteDrawer } from '@/components/route-drawer';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { FileList } from '@/extensions/nocobase-file-component-ui';

import { deleteMaterial, fetchMaterial } from './materials-api.js';
import type {
  Material,
  MaterialDetailOutletContext,
  MaterialsOutletContext,
} from './types.js';

/** The detail drawer, a child route of the materials list. */
export default function MaterialDetailPage(): ReactElement {
  const { materialId = '' } = useParams();
  // Remount on id change so the previous material's attachments never flash.
  return <MaterialDetail key={materialId} materialId={materialId} />;
}

function MaterialDetail({
  materialId,
}: {
  readonly materialId: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { reload: reloadList } = useOutletContext<MaterialsOutletContext>();
  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${materialId}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly material?: Material;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = `${materialId}:${reloadCount}`;
    fetchMaterial(api, materialId, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setResult({ key, material: data });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, materialId, reloadCount]);

  const reloadMaterial = useCallback(
    () => setReloadCount((current) => current + 1),
    [],
  );

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;
  const material = loading ? undefined : result?.material;
  const context: MaterialDetailOutletContext = { reloadMaterial, reloadList };

  let body: ReactElement;
  if (loading) {
    body = (
      <div
        role='status'
        className='flex items-center gap-2 text-muted-foreground'
      >
        <Spinner aria-hidden='true' />
        {t('status.loading')}
      </div>
    );
  } else if (status === 401) {
    body = (
      <Alert variant='destructive'>
        <CircleAlert />
        <AlertDescription>
          {t('materials.error.sessionExpired')}
        </AlertDescription>
      </Alert>
    );
  } else if (status === 404 || status === 403) {
    body = (
      <Alert variant='destructive'>
        <CircleAlert />
        <AlertDescription>
          {status === 404
            ? t('materials.error.notFound')
            : t('materials.error.forbidden')}
        </AlertDescription>
      </Alert>
    );
  } else if (error || !material) {
    body = (
      <Alert variant='destructive'>
        <CircleAlert />
        <AlertDescription role='alert'>
          {t('materials.loadFailed')}
        </AlertDescription>
        <Button variant='outline' size='sm' onClick={reloadMaterial}>
          {t('status.retry')}
        </Button>
      </Alert>
    );
  } else {
    body = <MaterialDetailBody material={material} />;
  }

  return (
    <RouteDrawer
      title={material?.title ?? t('materials.detail.title')}
      footer={
        <MaterialDetailFooter materialId={materialId} material={material} />
      }
    >
      {body}
      <Outlet context={context} />
    </RouteDrawer>
  );
}

function MaterialDetailBody({
  material,
}: {
  readonly material: Material;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const dateFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className='space-y-4'>
      <p className='text-sm text-muted-foreground'>
        {t('materials.updatedAt', {
          date: dateFormat.format(new Date(material.updatedAt)),
        })}
      </p>
      <section className='space-y-2'>
        <h2 className='text-sm font-medium'>
          {t('materials.fields.attachments')}
        </h2>
        <FileList
          files={material.files}
          emptyState={<p>{t('materials.attachmentsEmpty')}</p>}
          labels={{
            download: t('materials.download'),
            preview: t('materials.preview'),
          }}
        />
      </section>
    </div>
  );
}

function MaterialDetailFooter({
  materialId,
  material,
}: {
  readonly materialId: string;
  readonly material?: Material;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const { close } = useRouteOverlay();
  const { reload: reloadList } = useOutletContext<MaterialsOutletContext>();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // A material that did not load has no Edit or Delete affordance; a visitor
  // who cannot read the record only ever gets the drawer's Close button.
  if (!material) {
    return (
      <Button type='button' onClick={() => void close()}>
        {t('actions.close')}
      </Button>
    );
  }

  const remove = async (): Promise<void> => {
    setDeleting(true);
    try {
      await deleteMaterial(api, materialId);
      toaster.show({
        type: 'success',
        title: t('materials.delete.success'),
      });
      reloadList();
      await close();
    } catch (error: unknown) {
      const status = error instanceof ApiClientError ? error.status : undefined;
      if (status === 404) {
        // Already gone: refresh the list and leave the drawer.
        reloadList();
        await close();
        return;
      }
      toaster.show({ type: 'error', title: t('materials.delete.failed') });
    } finally {
      setDeleting(false);
    }
  };

  if (confirming) {
    return (
      <>
        <span className='mr-auto self-center text-sm text-muted-foreground'>
          {t('materials.delete.title')}
        </span>
        <Button
          type='button'
          variant='outline'
          disabled={deleting}
          onClick={() => setConfirming(false)}
        >
          {t('actions.cancel')}
        </Button>
        <Button
          type='button'
          variant='destructive'
          disabled={deleting}
          onClick={() => void remove()}
        >
          {deleting ? <Spinner data-icon='inline-start' /> : null}
          {t('materials.delete.confirm')}
        </Button>
      </>
    );
  }

  return (
    <>
      <Button
        type='button'
        variant='outline'
        nativeButton={false}
        render={<Link to='edit' />}
      >
        {t('materials.detail.edit')}
      </Button>
      <Button
        type='button'
        variant='outline'
        onClick={() => setConfirming(true)}
      >
        {t('materials.delete.action')}
      </Button>
      <Button type='button' onClick={() => void close()}>
        {t('actions.close')}
      </Button>
    </>
  );
}
