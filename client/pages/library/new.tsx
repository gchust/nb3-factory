import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useRef, useState } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { DocumentForm } from './document-form.js';
import type { LibraryOutletContext } from './types.js';

const FORM_ID = 'library-document-new-form';

export default function NewDocumentPage(): ReactElement {
  const { t } = useTranslation();
  // The state disables the buttons; the ref is for beforeClose to read: when
  // close() runs right after a successful save, the new state value has not
  // rendered yet.
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      title={t('library.create.title')}
      description={t('library.form.description')}
      className='sm:max-w-lg'
      // No closing while submitting: the × button, Esc, clicking the backdrop
      // and close() all go through beforeClose first.
      beforeClose={() => !submittingRef.current}
      footer={<NewDocumentFooter submitting={submitting} />}
    >
      <NewDocumentBody onSubmittingChange={handleSubmittingChange} />
    </RouteDialog>
  );
}

// useRouteOverlay() can only be called in a component inside RouteDialog, so
// the form and the footer buttons each get their own wrapper component.
function NewDocumentBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<LibraryOutletContext>();
  return (
    <DocumentForm
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onSubmitted={() => {
        reload();
        void close();
      }}
    />
  );
}

function NewDocumentFooter({
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
      {/* The button is outside the <form> and linked through the form
          attribute; while it is disabled, Enter does not submit either. */}
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('actions.saving') : t('actions.create')}
      </Button>
    </>
  );
}
