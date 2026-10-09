import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useEffect, useReducer, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router';

import { BackButton } from '@/components/back-button';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { RouteChildPage } from '@/components/route-child-page';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

import { fetchMaterial } from './material-api.js';
import { MaterialForm } from './material-form.js';
import type { Material, MaterialsOutletContext } from './types.js';

const FORM_ID = 'material-detail-form';

interface LoadResult {
  readonly key: string;
  readonly status: 'ready' | 'missing' | 'failed';
  readonly material?: Material;
}

/**
 * One material: its content, its attachments, and the form that saves a change back.
 *
 * It is a covering child page of the list, so the list keeps its place behind it and the BackButton returns to it.
 * The attachments are shown by the read-only file list, which previews and downloads through the session; removing
 * one takes effect when the material is saved.
 */
export default function MaterialDetailPage(): ReactElement {
  const { materialId = '' } = useParams();
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const navigate = useNavigate();
  const { reload } = useOutletContext<MaterialsOutletContext>();
  const [reloadCount, reloadDetail] = useReducer(
    (count: number) => count + 1,
    0,
  );
  const requestKey = `${materialId}:${reloadCount}`;
  const [result, setResult] = useState<LoadResult>();
  const [submitting, setSubmitting] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchMaterial(api, materialId, controller.signal)
      .then((material) =>
        setResult({ key: requestKey, status: 'ready', material }),
      )
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          key: requestKey,
          status:
            error instanceof ApiClientError && error.status === 404
              ? 'missing'
              : 'failed',
        });
      });
    return () => controller.abort();
  }, [api, materialId, requestKey]);

  const current = result?.key === requestKey ? result : undefined;

  if (!current) {
    return (
      <RouteChildPage>
        <PageContainer>
          <BackButton />
          <div className='flex items-center gap-2 text-muted-foreground'>
            <Spinner />
            <span>{t('status.loadingPage')}</span>
          </div>
        </PageContainer>
      </RouteChildPage>
    );
  }

  if (current.status !== 'ready' || !current.material) {
    return (
      <RouteChildPage>
        <PageContainer>
          <BackButton />
          <Alert variant='destructive'>
            <AlertDescription>
              {current.status === 'missing'
                ? t('materials.form.missing')
                : t('materials.loadFailed')}
            </AlertDescription>
          </Alert>
          {current.status === 'failed' ? (
            <Button type='button' variant='outline' onClick={reloadDetail}>
              {t('status.retry')}
            </Button>
          ) : null}
        </PageContainer>
      </RouteChildPage>
    );
  }

  const material = current.material;
  return (
    <RouteChildPage>
      <PageContainer>
        <BackButton />
        <PageHeader
          title={material.title}
          actions={
            <Button
              type='submit'
              form={FORM_ID}
              disabled={submitting || blocked}
            >
              {submitting ? <Spinner data-icon='inline-start' /> : null}
              {submitting
                ? t('materials.form.saving')
                : t('materials.form.save')}
            </Button>
          }
        />
        <MaterialForm
          material={material}
          formId={FORM_ID}
          onSubmittingChange={setSubmitting}
          onBlockedChange={setBlocked}
          onSubmitted={(saved) => {
            setResult({ key: requestKey, status: 'ready', material: saved });
            reload();
          }}
          onNotFound={() => {
            toaster.show({
              type: 'error',
              title: t('materials.form.missing'),
            });
            void navigate('..', { replace: true });
          }}
        />
      </PageContainer>
    </RouteChildPage>
  );
}
