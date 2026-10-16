import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useRef, useState } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '#components/route-dialog';
import { Button } from '#components/ui/button';
import { Spinner } from '#components/ui/spinner';
import { useRouteOverlay } from '#components/use-route-overlay';

import { createDocument } from './api.js';
import type { LibraryOutletContext } from './context.js';
import { DocumentForm } from './form.js';

const FORM_ID = 'library-new-form';

/** Route `/library/new`: the "new document" dialog, opened over the list. */
export default function NewDocumentPage(): ReactElement {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  // The ref is for `beforeClose`, which runs before the state update has rendered.
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      title={t('library.create.title')}
      description={t('library.create.description')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={<NewDocumentFooter submitting={submitting} />}
    >
      <NewDocumentBody onSubmittingChange={handleSubmittingChange} />
    </RouteDialog>
  );
}

// useRouteOverlay() can only be called inside RouteDialog, so the form and the footer buttons each get a wrapper.
function NewDocumentBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<LibraryOutletContext>();
  const api = useApiClient();
  return (
    <DocumentForm
      formId={FORM_ID}
      initial={{
        title: '',
        body: '',
        published: false,
        confidential: false,
      }}
      onSubmittingChange={onSubmittingChange}
      onSave={async (values) => {
        await createDocument(api, values);
        // The overlay refuses to close while the save is in flight, and the form only clears that flag once
        // `onSave` has settled — which is after this. Clear it here, before asking to close.
        onSubmittingChange(false);
        reload();
        await close();
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
      {/* Outside the <form>, linked through the form attribute; disabled, Enter does not submit either. */}
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('actions.saving') : t('actions.create')}
      </Button>
    </>
  );
}
