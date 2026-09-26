import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useRef, useState } from 'react';
import { useLocation, useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { BorrowForm } from './borrow-form.js';
import { OverlayCancelButton, OverlaySubmitButton } from './overlay-actions.js';
import type { EquipmentOutletContext } from './types.js';

const FORM_ID = 'equipment-borrow-form';

/** Route `/equipment/:equipmentId/borrow`: start a loan for the equipment of that row. */
export default function BorrowEquipmentPage(): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  const { equipmentId = '' } = useParams();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      title={t('borrow.create.title')}
      description={t('borrow.create.description')}
      className='sm:max-w-lg'
      closeTo={{ pathname: '/equipment', search: location.search }}
      beforeClose={() => !submittingRef.current}
      footer={<BorrowEquipmentFooter submitting={submitting} />}
    >
      <BorrowEquipmentBody
        equipmentId={Number(equipmentId)}
        onSubmittingChange={handleSubmittingChange}
      />
    </RouteDialog>
  );
}

function BorrowEquipmentBody({
  equipmentId,
  onSubmittingChange,
}: {
  readonly equipmentId: number;
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<EquipmentOutletContext>();
  return (
    <BorrowForm
      fixedEquipmentId={Number.isFinite(equipmentId) ? equipmentId : undefined}
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onSubmitted={() => {
        reload();
        void close();
      }}
    />
  );
}

function BorrowEquipmentFooter({
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
        label={t('equipment.actions.borrow')}
        submittingLabel={t('actions.saving')}
      />
    </>
  );
}
