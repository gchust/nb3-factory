import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useRef, useState } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import type { VisitorsOutletContext } from './types.js';
import { VisitorForm } from './visitor-form.js';

const FORM_ID = 'visitor-new-form';

/** Route `/visitors/new`: registers an arrival in a dialog over the register. */
export default function NewVisitorPage(): ReactElement {
  const { t } = useTranslation();
  // The state disables the buttons; the ref is what beforeClose reads, because
  // a close() right after a successful save runs before the new state renders.
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      title={t('visitors.create.title')}
      description={t('visitors.create.description')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={<NewVisitorFooter submitting={submitting} />}
    >
      <NewVisitorBody onSubmittingChange={handleSubmittingChange} />
    </RouteDialog>
  );
}

// useRouteOverlay() only works inside the RouteDialog, so the form and the
// footer buttons each get their own wrapper component.
function NewVisitorBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<VisitorsOutletContext>();
  return (
    <VisitorForm
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onSubmitted={() => {
        reload();
        void close();
      }}
    />
  );
}

function NewVisitorFooter({
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
        {submitting ? t('actions.saving') : t('actions.create')}
      </Button>
    </>
  );
}
