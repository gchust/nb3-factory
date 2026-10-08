import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useRef, useState, type ReactElement } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { MaterialForm } from './material-form.js';
import { createMaterial } from './materials-api.js';
import type { Material, MaterialsOutletContext } from './types.js';

const FORM_ID = 'material-new-form';

export default function NewMaterialPage(): ReactElement {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      title={t('materials.create.title')}
      description={t('materials.create.description')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={<NewMaterialFooter submitting={submitting} />}
    >
      <NewMaterialBody onSubmittingChange={handleSubmittingChange} />
    </RouteDialog>
  );
}

function NewMaterialBody({
  onSubmittingChange,
}: {
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
      onSubmittingChange={onSubmittingChange}
      submit={(content) => createMaterial(api, content)}
      onSubmitted={(material: Material) => {
        toaster.show({
          type: 'success',
          title: t('materials.create.success', { title: material.title }),
        });
        reload();
        void close();
      }}
    />
  );
}

function NewMaterialFooter({
  submitting,
}: {
  readonly submitting: boolean;
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
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting
          ? t('materials.create.submitting')
          : t('materials.create.submit')}
      </Button>
    </>
  );
}
