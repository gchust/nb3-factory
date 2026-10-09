import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useRef, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { MaterialForm } from './material-form.js';
import type { Material, MaterialsOutletContext } from './types.js';

const FORM_ID = 'material-create-form';

/** The "New material" dialog: a child route of the list, so the list stays behind it and refreshes on save. */
export default function CreateMaterialPage(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { reload } = useOutletContext<MaterialsOutletContext>();
  const [submitting, setSubmitting] = useState(false);
  const [blocked, setBlocked] = useState(false);
  // The ref is what beforeClose reads: when the dialog closes right after a save, the state has not rendered yet.
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  const handleSubmitted = (material: Material) => {
    reload();
    // The record the user just saved is what they want to look at next; the create route is replaced by its detail.
    void navigate(`../${encodeURIComponent(material.id)}`, { replace: true });
  };

  return (
    <RouteDialog
      title={t('materials.createTitle')}
      description={t('materials.createDescription')}
      className='sm:max-w-xl'
      // An upload in flight or a failed one would leave the material without the file the user chose.
      beforeClose={() => !submittingRef.current}
      footer={<CreateFooter submitting={submitting} blocked={blocked} />}
    >
      <MaterialForm
        formId={FORM_ID}
        onSubmittingChange={handleSubmittingChange}
        onBlockedChange={setBlocked}
        onSubmitted={handleSubmitted}
      />
    </RouteDialog>
  );
}

function CreateFooter({
  submitting,
  blocked,
}: {
  readonly submitting: boolean;
  readonly blocked: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  const disabled = submitting || blocked;
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
      <Button type='submit' form={FORM_ID} disabled={disabled}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('materials.form.saving') : t('materials.form.create')}
      </Button>
    </>
  );
}
