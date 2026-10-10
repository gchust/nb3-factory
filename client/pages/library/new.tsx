import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useCallback, useRef, useState } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { LibraryDocumentForm } from './library-document-form.js';
import type { LibraryListOutletContext } from './types.js';

const FORM_ID = 'library-document-create';

/** Renders one dialog body; it is inside the overlay, so it can close it. */
function CreateBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { onSaved } = useOutletContext<LibraryListOutletContext>();
  const handleSubmitted = useCallback((): void => {
    onSaved();
    void close();
  }, [close, onSaved]);
  return (
    <LibraryDocumentForm
      formId={FORM_ID}
      onNotFound={handleSubmitted}
      onSubmitted={handleSubmitted}
      onSubmittingChange={onSubmittingChange}
    />
  );
}

function CreateFooter({
  submitting,
}: {
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close, isClosing } = useRouteOverlay();
  return (
    <>
      <Button
        disabled={submitting || isClosing}
        onClick={() => void close()}
        variant='outline'
      >
        {t('actions.cancel')}
      </Button>
      <Button disabled={submitting} form={FORM_ID} type='submit'>
        {submitting ? t('actions.saving') : t('actions.save')}
      </Button>
    </>
  );
}

/** `/library/new`: creates a document owned by the signed-in author. */
export default function NewLibraryDocumentPage(): ReactElement {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const onSubmittingChange = useCallback((next: boolean): void => {
    submittingRef.current = next;
    setSubmitting(next);
  }, []);

  return (
    <RouteDialog
      beforeClose={() => !submittingRef.current}
      description={t('library.create.description')}
      footer={<CreateFooter submitting={submitting} />}
      title={t('library.create.title')}
    >
      <CreateBody onSubmittingChange={onSubmittingChange} />
    </RouteDialog>
  );
}
