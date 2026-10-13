import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useOutletContext, useParams } from 'react-router';

import { Loading } from '#components/loading';
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

import { getDocument } from '../api.js';
import { DocumentForm } from '../document-form.js';
import type {
  DocumentDetailOutletContext,
  DocumentsOutletContext,
  DocumentSummary,
} from '../types.js';

const FORM_ID = 'document-edit-form';

/**
 * Editing one document.
 *
 * The same page serves the list's "edit" child route and the drawer's, so it reads whichever context its parent
 * provides. It loads the latest document before rendering the form, so the fields never show stale values.
 */
export default function EditDocumentPage(): ReactElement {
  const api = useApiClient();
  const { t } = useTranslation();
  const { documentId } = useParams<{ documentId: string }>();
  const context = useOutletContext<
    DocumentDetailOutletContext | DocumentsOutletContext
  >();
  const [document, setDocument] = useState<DocumentSummary>();
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const dirtyRef = useRef(false);
  const [discardPrompt, setDiscardPrompt] = useState<{
    readonly answer: (discard: boolean) => void;
  }>();

  const reloadSources = useCallback((): void => {
    if ('reloadDocument' in context) {
      context.reloadDocument();
      context.reloadList();
    } else {
      context.reload();
    }
  }, [context]);

  // The effect reads the latest reload through a ref, so a parent re-render (which creates a new context object) does
  // not restart the request.
  const reloadSourcesRef = useRef(reloadSources);
  useEffect(() => {
    reloadSourcesRef.current = reloadSources;
  });

  // The first load sets state only from the request's continuation, so nothing updates in the effect body itself.
  useEffect(() => {
    if (!documentId) return;
    let cancelled = false;
    void getDocument(api, documentId)
      .then((row) => {
        if (!cancelled) setDocument(row);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiClientError && error.status === 404) {
          setMissing(true);
          reloadSourcesRef.current();
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, documentId]);

  const handleSubmittingChange = useCallback((value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  }, []);
  const handleDirtyChange = useCallback((dirty: boolean): void => {
    dirtyRef.current = dirty;
  }, []);

  function answerDiscard(discard: boolean): void {
    discardPrompt?.answer(discard);
    setDiscardPrompt(undefined);
  }

  if (loading || (document !== undefined && document.id !== documentId)) {
    return (
      <RouteDialog title={t('library.form.editTitle')}>
        <Loading className='py-16' />
      </RouteDialog>
    );
  }

  if (missing || !document) {
    return (
      <RouteDialog
        title={t('library.form.editTitle')}
        description={t('library.form.missing')}
        footer={<EditDocumentCloseFooter onClose={reloadSources} />}
      />
    );
  }

  return (
    <RouteDialog
      title={t('library.form.editTitle')}
      description={document.title}
      className='sm:max-w-lg'
      beforeClose={() => {
        if (submittingRef.current) return false;
        if (!dirtyRef.current) return true;
        return new Promise<boolean>((resolve) => {
          setDiscardPrompt({ answer: resolve });
        });
      }}
      footer={<EditDocumentFooter submitting={submitting} />}
    >
      <EditDocumentBody
        document={document}
        onSubmittingChange={handleSubmittingChange}
        onDirtyChange={handleDirtyChange}
        onSaved={() => {
          reloadSources();
        }}
        onNotFound={() => {
          setMissing(true);
          reloadSources();
        }}
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

function EditDocumentBody({
  document,
  onSubmittingChange,
  onDirtyChange,
  onSaved,
  onNotFound,
}: {
  readonly document: DocumentSummary;
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly onSaved: () => void;
  readonly onNotFound: () => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  return (
    <DocumentForm
      formId={FORM_ID}
      document={document}
      onSubmittingChange={onSubmittingChange}
      onDirtyChange={onDirtyChange}
      onNotFound={onNotFound}
      onSubmitted={() => {
        onDirtyChange(false);
        onSaved();
        void close();
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
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('library.form.saving') : t('library.form.save')}
      </Button>
    </>
  );
}

function EditDocumentCloseFooter({
  onClose,
}: {
  readonly onClose: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <Button
      variant='outline'
      onClick={() => {
        onClose();
        void close();
      }}
    >
      {t('actions.close')}
    </Button>
  );
}
