import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useRef, useState } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { ProjectMaterialForm } from './project-material-form.js';
import type { ProjectMaterialsOutletContext } from './types.js';

const FORM_ID = 'project-material-new-form';

/** Route `/project-materials/new`: create a material in a dialog. */
export default function NewProjectMaterialPage(): ReactElement {
  const { t } = useTranslation();
  // The state disables the buttons; the ref is what `beforeClose` reads, because
  // `close()` right after a successful save runs before the state re-renders.
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      title={t('projectMaterials.create.title')}
      description={t('projectMaterials.create.description')}
      className='sm:max-w-lg'
      // No closing while saving or uploading (a half-uploaded file would be lost).
      beforeClose={() => !submittingRef.current}
      footer={<NewProjectMaterialFooter submitting={submitting || uploading} />}
    >
      <NewProjectMaterialBody
        onSubmittingChange={handleSubmittingChange}
        onUploadingChange={setUploading}
      />
    </RouteDialog>
  );
}

// `useRouteOverlay()` only works in a component rendered inside the dialog, so
// the form and the footer buttons each get their own wrapper.
function NewProjectMaterialBody({
  onSubmittingChange,
  onUploadingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onUploadingChange: (uploading: boolean) => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<ProjectMaterialsOutletContext>();
  return (
    <ProjectMaterialForm
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onUploadingChange={onUploadingChange}
      onSubmitted={() => {
        reload();
        void close();
      }}
    />
  );
}

function NewProjectMaterialFooter({
  submitting,
}: {
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close, isClosing } = useRouteOverlay();
  return (
    <>
      <Button
        type='button'
        variant='outline'
        disabled={submitting || isClosing}
        onClick={() => void close()}
      >
        {t('actions.cancel')}
      </Button>
      {/* Outside the <form>, linked through the `form` attribute; on success the form has already shown the toast. */}
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('actions.saving') : t('projectMaterials.create.submit')}
      </Button>
    </>
  );
}
