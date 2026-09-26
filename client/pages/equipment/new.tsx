import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useRef, useState } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { EquipmentForm } from './equipment-form.js';
import { OverlayCancelButton, OverlaySubmitButton } from './overlay-actions.js';
import type { EquipmentOutletContext } from './types.js';

const FORM_ID = 'equipment-new-form';

/** Route `/equipment/new`: create an equipment record. */
export default function NewEquipmentPage(): ReactElement {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      title={t('equipment.create.title')}
      description={t('equipment.form.description')}
      className='sm:max-w-lg'
      // No closing while submitting, through the × button, Esc, the backdrop or close().
      beforeClose={() => !submittingRef.current}
      footer={<NewEquipmentFooter submitting={submitting} />}
    >
      <NewEquipmentBody onSubmittingChange={handleSubmittingChange} />
    </RouteDialog>
  );
}

function NewEquipmentBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<EquipmentOutletContext>();
  return (
    <EquipmentForm
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onSubmitted={() => {
        reload();
        void close();
      }}
    />
  );
}

function NewEquipmentFooter({
  submitting,
}: {
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <>
      <OverlayCancelButton disabled={submitting} />
      <OverlaySubmitButton
        formId={FORM_ID}
        submitting={submitting}
        label={t('actions.create')}
        submittingLabel={t('actions.saving')}
      />
    </>
  );
}
