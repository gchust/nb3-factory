import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { Loading } from '@/components/loading';
import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { MaterialForm } from './material-form.js';
import { fetchMaterial, updateMaterial } from './materials-api.js';
import { MaterialsRequestError } from './materials-request-error.js';
import type { Material, MaterialsOutletContext } from './types.js';

const FORM_ID = 'material-edit-form';

export default function EditMaterialPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { materialId } = useParams();
  const id = Number(materialId);
  const [reloadCount, setReloadCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
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
  const retry = (): void => setReloadCount((value) => value + 1);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      title={t('materials.edit.title')}
      description={t('materials.edit.description')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={
        <EditMaterialFooter submitting={submitting} ready={Boolean(material)} />
      }
    >
      {error ? (
        <MaterialsRequestError error={error} onRetry={retry} />
      ) : loading ? (
        <Loading className='min-h-32' />
      ) : material ? (
        <EditMaterialBody
          key={material.id}
          material={material}
          onSubmittingChange={handleSubmittingChange}
        />
      ) : null}
    </RouteDialog>
  );
}

function EditMaterialBody({
  material,
  onSubmittingChange,
}: {
  readonly material: Material;
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<MaterialsOutletContext>();
  const api = useApiClient();
  const toaster = useToaster();
  const { t } = useTranslation();

  return (
    <MaterialForm
      formId={FORM_ID}
      initial={{ title: material.title, body: material.body }}
      onSubmittingChange={onSubmittingChange}
      submit={(content) => updateMaterial(api, material.id, content)}
      onSubmitted={(updated: Material) => {
        toaster.show({
          type: 'success',
          title: t('materials.edit.success', { title: updated.title }),
        });
        reload();
        void close();
      }}
    />
  );
}

function EditMaterialFooter({
  submitting,
  ready,
}: {
  readonly submitting: boolean;
  readonly ready: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <>
      <Button
        type='button'
        variant='outline'
        disabled={submitting}
        onClick={() => void close()}
      >
        {t('actions.cancel')}
      </Button>
      <Button type='submit' form={FORM_ID} disabled={submitting || !ready}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting
          ? t('materials.edit.submitting')
          : t('materials.edit.submit')}
      </Button>
    </>
  );
}
