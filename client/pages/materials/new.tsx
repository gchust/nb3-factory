import { useTranslation } from '@nocobase/i18n/client';
import { useRef, useState, type ReactElement } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { MaterialForm } from './material-form.js';
import type { MaterialsOutletContext } from './types.js';

const FORM_ID = 'material-create-form';

/** The create dialog, a child route of the materials list. */
export default function NewMaterialPage(): ReactElement {
  const { t } = useTranslation();
  // The state disables the buttons; the ref lets `beforeClose` read the latest
  // value before the state change has rendered.
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      title={t('materials.create.title')}
      description={t('materials.form.description')}
      // Nothing may close the dialog mid-save, including Esc and the backdrop.
      beforeClose={() => !submittingRef.current}
      footer={<NewMaterialFooter submitting={submitting} />}
    >
      <NewMaterialBody onSubmittingChange={handleSubmittingChange} />
    </RouteDialog>
  );
}

// `useRouteOverlay()` may only be called by a component inside the overlay, so
// the form and the footer buttons each get their own wrapper.
function NewMaterialBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<MaterialsOutletContext>();
  return (
    <MaterialForm
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onSubmitted={() => {
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
      {/* Outside the <form>, linked through `form`; disabled also blocks Enter. */}
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('actions.saving') : t('actions.create')}
      </Button>
    </>
  );
}
