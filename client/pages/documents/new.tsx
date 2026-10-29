import { AlertCircleIcon } from 'lucide-react';
import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import { BackButton } from '#components/back-button';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Spinner } from '#components/ui/spinner';

import { fetchDocuments } from './document-api.js';
import { DocumentForm } from './document-form.js';

const FORM_ID = 'document-create-form';

/** A form too long for a dialog, so it has its own page. The buttons sit below the form. */
export default function NewDocumentPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  // Whether this account may create at all is the server's answer, not a page grant: the create button on the library
  // is hidden without it, and a colleague who reaches this URL directly is told so instead of filling in a form the
  // server will refuse.
  const [canCreate, setCanCreate] = useState<boolean>();

  useEffect(() => {
    const controller = new AbortController();
    fetchDocuments(api, controller.signal).then(
      (list) => {
        if (!controller.signal.aborted) setCanCreate(list.meta.canCreate);
      },
      () => {
        if (!controller.signal.aborted) setCanCreate(false);
      },
    );
    return () => controller.abort();
  }, [api]);

  if (canCreate === false) {
    return (
      <PageContainer className='mx-auto max-w-2xl'>
        <BackButton>{t('documents.back')}</BackButton>
        <PageHeader title={t('documents.createTitle')} />
        <Alert variant='destructive'>
          <AlertCircleIcon />
          <AlertDescription>{t('documents.error.forbidden')}</AlertDescription>
        </Alert>
      </PageContainer>
    );
  }

  return (
    <PageContainer className='mx-auto max-w-2xl'>
      <BackButton>{t('documents.back')}</BackButton>
      <PageHeader
        title={t('documents.createTitle')}
        description={t('documents.createDescription')}
      />
      <DocumentForm
        formId={FORM_ID}
        onSubmittingChange={setSubmitting}
        onSubmitted={(document) => {
          // Replace the history entry, so Back returns to the library rather than to an empty form.
          void navigate(`/documents/${encodeURIComponent(document.id)}`, {
            replace: true,
          });
        }}
      />
      <div className='flex flex-wrap justify-end gap-2'>
        <Button
          variant='outline'
          disabled={submitting}
          onClick={() => void navigate('/documents')}
        >
          {t('documents.cancel')}
        </Button>
        <Button type='submit' form={FORM_ID} disabled={submitting}>
          {submitting ? <Spinner data-icon='inline-start' /> : null}
          {submitting ? t('documents.saving') : t('documents.save')}
        </Button>
      </div>
    </PageContainer>
  );
}
