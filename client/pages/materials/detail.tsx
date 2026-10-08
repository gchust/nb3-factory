import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';
import { useParams } from 'react-router';

import { Loading } from '@/components/loading';
import { RouteDrawer } from '@/components/route-drawer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { fetchMaterial } from './materials-api.js';
import { MaterialsRequestError } from './materials-request-error.js';
import type { Material } from './types.js';

export default function MaterialDetailPage(): ReactElement {
  const { materialId } = useParams();
  const id = Number(materialId);
  // Remounting on the id resets the request state when the user opens another material.
  return <MaterialDetailDrawer key={id} id={id} />;
}

function MaterialDetailDrawer({ id }: { readonly id: number }): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [reloadCount, setReloadCount] = useState(0);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly material?: Material;
    readonly error?: unknown;
  }>();

  const requestKey = `${id}:${reloadCount}`;
  useEffect(() => {
    const controller = new AbortController();
    const key = `${id}:${reloadCount}`;
    fetchMaterial(api, id, controller.signal).then(
      (material) => {
        if (!controller.signal.aborted) setResult({ key, material });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, id, reloadCount]);

  const loading = result?.key !== requestKey;
  const material = result?.material;
  const error = loading ? undefined : result?.error;

  return (
    <RouteDrawer
      title={material?.title ?? t('materials.detail.title')}
      description={
        material?.restricted ? t('materials.restrictedDescription') : undefined
      }
      footer={<MaterialDetailFooter />}
    >
      {error ? (
        <MaterialsRequestError
          error={error}
          onRetry={() => setReloadCount((value) => value + 1)}
        />
      ) : loading ? (
        <Loading className='min-h-32' />
      ) : material ? (
        <MaterialDetail material={material} />
      ) : null}
    </RouteDrawer>
  );
}

function MaterialDetail({
  material,
}: {
  readonly material: Material;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <dl className='space-y-4'>
      {material.restricted ? (
        <div className='space-y-1'>
          <dt className='sr-only'>{t('materials.restricted')}</dt>
          <dd>
            <Badge variant='outline'>{t('materials.restricted')}</Badge>
          </dd>
        </div>
      ) : null}
      <div className='space-y-1'>
        <dt className='text-sm font-medium text-muted-foreground'>
          {t('materials.field.body')}
        </dt>
        <dd className='text-sm whitespace-pre-wrap'>{material.body}</dd>
      </div>
      <div className='space-y-1'>
        <dt className='text-sm font-medium text-muted-foreground'>
          {t('materials.updatedAt')}
        </dt>
        <dd className='text-sm'>
          {new Date(material.updatedAt).toLocaleString()}
        </dd>
      </div>
    </dl>
  );
}

function MaterialDetailFooter(): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <Button type='button' variant='outline' onClick={() => void close()}>
      {t('actions.close')}
    </Button>
  );
}
