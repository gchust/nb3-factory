import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { PencilIcon } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Link, Outlet, useOutletContext, useParams } from 'react-router';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { RouteDrawer } from '@/components/route-drawer';
import { Spinner } from '@/components/ui/spinner';
import type {
  Material,
  MaterialEditOutletContext,
  MaterialsOutletContext,
} from '../types.js';
import { MATERIALS_RESOURCE_ID, toMaterialId } from '../types.js';

/**
 * A record's own drawer. A colleague can open any material the list showed
 * them; a confidential row is never returned by the server to a colleague, so
 * opening it directly ends in "not found" rather than a leak.
 */
export default function MaterialDetailPage(): ReactElement {
  const { materialId } = useParams<{ materialId: string }>();

  if (!materialId) {
    return <MaterialDetailMissing />;
  }

  return <MaterialDetail key={materialId} materialId={materialId} />;
}

function MaterialDetailMissing(): ReactElement {
  const { t } = useTranslation();
  return (
    <RouteDrawer title={t('materials.detail.title')}>
      <Alert>
        <AlertTitle>{t('materials.error.notFoundTitle')}</AlertTitle>
        <AlertDescription>{t('materials.error.notFound')}</AlertDescription>
      </Alert>
    </RouteDrawer>
  );
}

function MaterialDetail({
  materialId,
}: {
  readonly materialId: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { reload } = useOutletContext<MaterialsOutletContext>();
  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${materialId}:${reloadCount}`;
  const id = toMaterialId(materialId);

  const [result, setResult] = useState<{
    readonly key: string;
    readonly material?: Material | null;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    // An unusable id cannot name a row, so there is nothing to request.
    if (id === null) return;
    const controller = new AbortController();
    const key = requestKey;
    api
      .repository<Material>('materials')
      .findOne({ filter: { id } })
      .then(
        (material) => {
          if (!controller.signal.aborted)
            setResult({ key, material: material ?? null });
        },
        (error: unknown) => {
          if (!controller.signal.aborted) setResult({ key, error });
        },
      );
    return () => controller.abort();
  }, [api, id, requestKey]);

  const current = result?.key === requestKey ? result : undefined;
  const loading = id !== null && current === undefined;
  const loadError = current?.error;
  const missing = id === null || current?.material === null;
  const material = current?.material ?? undefined;

  const canEdit = useCan({
    resource: { type: 'composite', id: MATERIALS_RESOURCE_ID },
    action: 'edit',
  });

  const outletContext = useMemo<MaterialEditOutletContext>(
    () => ({
      reload,
      // The edit dialog hands the saved record back so the drawer shows the new
      // content at once, without re-requesting it.
      onSaved: (record: Material) =>
        setResult({ key: requestKey, material: record }),
    }),
    [reload, requestKey],
  );

  const retryable =
    loadError !== undefined &&
    !(loadError instanceof ApiClientError && loadError.status === 403);

  return (
    <RouteDrawer
      footer={
        material && canEdit.can ? (
          <Button
            nativeButton={false}
            render={<Link to='edit' />}
            variant='outline'
          >
            <PencilIcon data-icon='inline-start' />
            {t('materials.edit.action')}
          </Button>
        ) : undefined
      }
      title={material?.title ?? t('materials.detail.title')}
    >
      {loading ? (
        <div className='flex justify-center p-6'>
          <Spinner className='size-6' />
        </div>
      ) : null}

      {loadError ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('materials.error.title')}</AlertTitle>
          <AlertDescription className='space-y-3'>
            <p>
              {loadError instanceof ApiClientError && loadError.status === 403
                ? t('materials.error.forbidden')
                : t('materials.error.requestFailed')}
            </p>
            {retryable ? (
              <Button
                onClick={() => setReloadCount((count) => count + 1)}
                size='sm'
                variant='outline'
              >
                {t('status.retry')}
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {missing ? (
        <Alert>
          <AlertTitle>{t('materials.error.notFoundTitle')}</AlertTitle>
          <AlertDescription>{t('materials.error.notFound')}</AlertDescription>
        </Alert>
      ) : null}

      {material ? (
        <article className='space-y-3'>
          <p className='text-sm leading-6 whitespace-pre-wrap'>
            {material.body}
          </p>
          {material.confidential ? (
            <p className='text-sm font-medium text-destructive'>
              {t('materials.detail.confidential')}
            </p>
          ) : null}
        </article>
      ) : null}

      <Outlet context={outletContext} />
    </RouteDrawer>
  );
}
