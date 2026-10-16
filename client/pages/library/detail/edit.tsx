import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, type ReactNode, useRef, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '#components/route-dialog';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Spinner } from '#components/ui/spinner';
import { useRouteOverlay } from '#components/use-route-overlay';

import { updateDocument } from '../api.js';
import type { LibraryDetailOutletContext } from '../context.js';
import { DocumentForm } from '../form.js';

const FORM_ID = 'library-edit-form';

/**
 * Route `/library/:id/edit`: the edit dialog, declared under the document it
 * edits so it stacks on that document and closing returns to it.
 *
 * The form opens with the values the detail page fetched, and the endpoint
 * refuses the write for a caller who may read the document but not change it.
 * Reading is not editing: a reader who reaches this route by URL gets the
 * reason, not a form whose Save would be refused.
 */
export default function EditDocumentPage(): ReactElement {
  const { t } = useTranslation();
  const { document } = useOutletContext<LibraryDetailOutletContext>();
  const [submitting, setSubmitting] = useState(false);
  // The ref is for `beforeClose`, which runs before the state update has rendered.
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  let footer: ReactNode = undefined;
  let children: ReactNode;
  if (document.editable) {
    footer = <EditDocumentFooter submitting={submitting} />;
    children = <EditDocumentBody onSubmittingChange={handleSubmittingChange} />;
  } else {
    children = (
      <Alert variant='destructive'>
        <AlertDescription>{t('library.edit.forbidden')}</AlertDescription>
      </Alert>
    );
  }

  return (
    <RouteDialog
      title={t('library.edit.title')}
      description={t('library.edit.description')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={footer}
    >
      {children}
    </RouteDialog>
  );
}

function EditDocumentBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const api = useApiClient();
  const { id = '' } = useParams();
  const { close } = useRouteOverlay();
  const { document, onChanged } =
    useOutletContext<LibraryDetailOutletContext>();
  return (
    <DocumentForm
      formId={FORM_ID}
      initial={{
        title: document.title,
        body: document.body,
        published: document.published,
        confidential: document.confidential,
      }}
      onSubmittingChange={onSubmittingChange}
      onSave={async (values) => {
        const saved = await updateDocument(api, id, values);
        // The overlay refuses to close while the save is in flight, and the form only clears that flag once
        // `onSave` has settled — which is after this. Clear it here, before asking to close.
        onSubmittingChange(false);
        onChanged(saved);
        await close();
      }}
    />
  );
}

function EditDocumentFooter({
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
        {submitting ? t('actions.saving') : t('actions.save')}
      </Button>
    </>
  );
}
