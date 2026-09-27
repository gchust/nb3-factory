import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { RouteChildPage } from '@/components/route-child-page';

import { useProjectMaterialsApi, type ProjectMaterialView } from './api.js';
import { MaterialForm } from './shared.js';

type DetailState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly material: ProjectMaterialView };

export default function MaterialDetailPage(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useParams();
  const materialId = params.materialId ?? '';
  const api = useProjectMaterialsApi();
  const [state, setState] = useState<DetailState>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await api.get(materialId);
        if (controller.signal.aborted) return;
        setState({ status: 'ready', material: response.data });
      } catch {
        if (controller.signal.aborted) return;
        setState({ status: 'error' });
      }
    })();
    return () => controller.abort();
  }, [api, materialId, reloadToken]);

  return (
    <RouteChildPage>
      <PageContainer>
        <Breadcrumbs />
        {state.status === 'loading' ? (
          <>
            <PageHeader title={t('materials.detail.title')} />
            <div className='space-y-3' role='status'>
              <Skeleton className='h-10 w-full' />
              <Skeleton className='h-24 w-full' />
            </div>
          </>
        ) : null}

        {state.status === 'error' ? (
          <>
            <PageHeader title={t('materials.detail.title')} />
            <Alert variant='destructive'>
              <AlertTitle>{t('materials.errors.notFound')}</AlertTitle>
              <AlertDescription>
                <div className='flex flex-col items-start gap-3'>
                  <span>{t('materials.errors.notFoundHint')}</span>
                  <div className='flex gap-2'>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={() => {
                        setState({ status: 'loading' });
                        setReloadToken((token) => token + 1);
                      }}
                    >
                      {t('status.retry')}
                    </Button>
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      onClick={() => void navigate('..')}
                    >
                      {t('materials.backToList')}
                    </Button>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          </>
        ) : null}

        {state.status === 'ready' ? (
          <>
            <PageHeader
              title={state.material.title}
              description={t('materials.detail.description')}
            />
            <Card>
              <CardContent>
                <MaterialForm
                  mode='edit'
                  material={state.material}
                  onSaved={(material) =>
                    setState({ status: 'ready', material })
                  }
                  onCancel={() => void navigate('..')}
                />
              </CardContent>
            </Card>
          </>
        ) : null}
      </PageContainer>
    </RouteChildPage>
  );
}
