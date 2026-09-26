import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useRef, useState } from 'react';
import { useLocation, useOutletContext } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { BorrowForm } from '../equipment/borrow-form.js';
import {
  OverlayCancelButton,
  OverlaySubmitButton,
} from '../equipment/overlay-actions.js';
import type { BorrowRecordsOutletContext } from '../equipment/types.js';

const FORM_ID = 'borrow-record-new-form';

/** Route `/borrow-records/new`: borrow a device without starting from its ledger row. */
export default function NewBorrowRecordPage(): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
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
      closeTo={{ pathname: '/borrow-records', search: location.search }}
      beforeClose={() => !submittingRef.current}
      footer={<NewBorrowRecordFooter submitting={submitting} />}
    >
      <NewBorrowRecordBody onSubmittingChange={handleSubmittingChange} />
    </RouteDialog>
  );
}

function NewBorrowRecordBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<BorrowRecordsOutletContext>();
  return (
    <BorrowForm
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onSubmitted={() => {
        reload();
        void close();
      }}
    />
  );
}

function NewBorrowRecordFooter({
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
