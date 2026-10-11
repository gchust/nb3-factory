import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useCallback, useRef, useState } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '#components/route-dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#components/ui/alert-dialog';
import { Button } from '#components/ui/button';
import { Spinner } from '#components/ui/spinner';
import { useRouteOverlay } from '#components/use-route-overlay';

import { DocumentForm } from './document-form.js';
import type { DocumentsListContext } from './types.js';

const FORM_ID = 'document-new-form';

/** `/documents/new` — the create dialog, alone over the list. */
export default function NewDocumentPage(): ReactElement {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const dirtyRef = useRef(false);
  const handleDirtyChange = useCallback((dirty: boolean): void => {
    dirtyRef.current = dirty;
  }, []);
  const [discardPrompt, setDiscardPrompt] = useState<{
    readonly answer: (discard: boolean) => void;
  }>();

  function answerDiscard(discard: boolean): void {
    discardPrompt?.answer(discard);
    setDiscardPrompt(undefined);
  }

  return (
    <RouteDialog
      title={t('documents.create.title')}
      description={t('documents.form.description')}
      className='sm:max-w-lg'
      beforeClose={() => {
        if (submittingRef.current) return false;
        if (!dirtyRef.current) return true;
        return new Promise<boolean>((resolve) => {
          setDiscardPrompt({ answer: resolve });
        });
      }}
      footer={<NewDocumentFooter submitting={submitting} />}
    >
      <NewDocumentBody
        onSubmittingChange={(value) => {
          submittingRef.current = value;
          setSubmitting(value);
        }}
        onDirtyChange={handleDirtyChange}
      />
      <AlertDialog
        open={discardPrompt !== undefined}
        onOpenChange={(open) => {
          if (!open) answerDiscard(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('documents.discard.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('documents.discard.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t('documents.discard.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={() => answerDiscard(true)}
            >
              {t('documents.discard.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </RouteDialog>
  );
}

// `useRouteOverlay()` can only be called inside `RouteDialog`, so the form and the footer buttons each get a wrapper.
function NewDocumentBody({
  onSubmittingChange,
  onDirtyChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onDirtyChange: (dirty: boolean) => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<DocumentsListContext>();
  return (
    <DocumentForm
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onDirtyChange={onDirtyChange}
      onSubmitted={() => {
        // The save succeeded, so nothing is unsaved any more.
        onDirtyChange(false);
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
      {/* The button is outside the <form>; the form attribute keeps Enter in a field submitting it too. */}
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('actions.saving') : t('actions.create')}
      </Button>
    </>
  );
}
