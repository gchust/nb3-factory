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
import type { DocumentsOutletContext } from './types.js';

const FORM_ID = 'document-new-form';

/** Creating a document: a child route of the list, shown as a dialog over it. */
export default function NewDocumentPage(): ReactElement {
  const { t } = useTranslation();
  // The state disables the buttons; the ref is what beforeClose reads, because close() can run before a new state
  // value has rendered.
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const dirtyRef = useRef(false);
  const handleSubmittingChange = useCallback((value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  }, []);
  // The form reports unsaved input through onDirtyChange; on a successful save the body clears this ref before
  // closing, so the close after saving does not ask to discard what was just saved.
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
      title={t('library.form.createTitle')}
      description={t('library.form.createDescription')}
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
        onSubmittingChange={handleSubmittingChange}
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
            <AlertDialogTitle>{t('library.discard.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('library.discard.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('library.discard.keep')}</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={() => answerDiscard(true)}
            >
              {t('library.discard.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </RouteDialog>
  );
}

// useRouteOverlay() only works inside RouteDialog, so the form and the footer buttons each get their own wrapper.
function NewDocumentBody({
  onSubmittingChange,
  onDirtyChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onDirtyChange: (dirty: boolean) => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<DocumentsOutletContext>();
  return (
    <DocumentForm
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onDirtyChange={onDirtyChange}
      onSubmitted={() => {
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
        {submitting ? t('library.form.saving') : t('library.form.create')}
      </Button>
    </>
  );
}
