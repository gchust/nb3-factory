import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { FileText, Plus } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { Loading } from '@/components/loading';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { fetchMaterials } from './materials-api.js';
import { MaterialsRequestError } from './materials-request-error.js';
import type { Material, MaterialsOutletContext } from './types.js';
import { useCanManageMaterials } from './use-can-manage.js';

export default function MaterialsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const location = useLocation();
  const canManage = useCanManageMaterials();
  const [reloadCount, setReloadCount] = useState(0);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly materials?: readonly Material[];
    readonly error?: unknown;
  }>();

  const requestKey = `${reloadCount}`;
  useEffect(() => {
    const controller = new AbortController();
    const key = `${reloadCount}`;
    fetchMaterials(api, controller.signal).then(
      (response) => {
        if (!controller.signal.aborted) {
          setResult({ key, materials: response.data });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setResult({ key, error });
        }
      },
    );
    return () => controller.abort();
  }, [api, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const materials = result?.materials;
  const reload = useCallback(() => setReloadCount((value) => value + 1), []);
  const outletContext = useMemo<MaterialsOutletContext>(
    () => ({ reload }),
    [reload],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('materials.title')}
        description={t('materials.description')}
        actions={
          canManage ? (
            <Button
              render={
                <Link to={{ pathname: 'new', search: location.search }} />
              }
            >
              <Plus />
              {t('materials.create')}
            </Button>
          ) : null
        }
      />

      {error ? (
        <MaterialsRequestError error={error} onRetry={reload} />
      ) : loading && !materials ? (
        <Loading className='min-h-64' />
      ) : materials && materials.length > 0 ? (
        <ul className='grid gap-3'>
          {materials.map((material) => (
            <MaterialCard
              key={material.id}
              material={material}
              canManage={canManage}
            />
          ))}
        </ul>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <FileText />
            </EmptyMedia>
            <EmptyTitle>{t('materials.empty.title')}</EmptyTitle>
            <EmptyDescription>
              {t('materials.empty.description')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <Outlet context={outletContext} />
    </PageContainer>
  );
}

function MaterialCard({
  material,
  canManage,
}: {
  readonly material: Material;
  readonly canManage: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  return (
    <li>
      <Card>
        <CardHeader>
          <CardTitle>
            <Link
              className='hover:text-primary'
              to={{
                pathname: `/materials/${material.id}`,
                search: location.search,
              }}
            >
              {material.title}
            </Link>
          </CardTitle>
          {material.restricted ? (
            <CardAction>
              <Badge variant='outline'>{t('materials.restricted')}</Badge>
            </CardAction>
          ) : null}
          <CardDescription className='line-clamp-2'>
            {material.body}
          </CardDescription>
        </CardHeader>
        {canManage ? (
          <CardFooter className='gap-2'>
            <Button
              variant='outline'
              size='sm'
              render={
                <Link
                  to={{
                    pathname: `/materials/${material.id}/edit`,
                    search: location.search,
                  }}
                />
              }
            >
              {t('materials.edit')}
            </Button>
          </CardFooter>
        ) : null}
      </Card>
    </li>
  );
}
