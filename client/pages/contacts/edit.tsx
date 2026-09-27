import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useEffect, useReducer, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

import { fetchContact } from '../sales/api.js';
import { ListSkeleton } from '../sales/list-skeleton.js';
import type { Contact, SalesListOutletContext } from '../sales/types.js';
import { ContactForm } from './contact-form.js';

const FORM_ID = 'contact-edit-form';

/** Route `/contacts/:contactId/edit`: edit a contact in a dialog over the list. */
export default function ContactEditPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { close } = useRouteOverlay();
  const { contactId } = useParams();
  const { reload: reloadList } = useOutletContext<SalesListOutletContext>();

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const [result, setResult] = useState<{
    readonly key: number;
    readonly contact?: Contact;
    readonly error?: unknown;
  }>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    if (contactId === undefined) return undefined;
    fetchContact(api, contactId, controller.signal).then(
      (contact) => {
        if (!controller.signal.aborted)
          setResult({ key: reloadCount, contact });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key: reloadCount, error });
      },
    );
    return () => controller.abort();
  }, [api, contactId, reloadCount]);

  const loading = result?.key !== reloadCount;
  const error = loading ? undefined : result?.error;
  const notFound = error instanceof ApiClientError && error.status === 404;
  const contact = loading ? undefined : result?.contact;

  let body: ReactElement;
  if (notFound) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('sales.contacts.form.notFoundTitle')}</AlertTitle>
        <AlertDescription>
          {t('sales.contacts.form.notFoundDescription')}
        </AlertDescription>
      </Alert>
    );
  } else if (error !== undefined) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('sales.contacts.errorTitle')}</AlertTitle>
        <AlertDescription>{t('sales.errorRequestFailed')}</AlertDescription>
        <AlertAction>
          <Button variant='outline' size='sm' onClick={reload}>
            {t('status.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (contact === undefined) {
    body = <ListSkeleton label={t('status.loading')} />;
  } else {
    body = (
      <ContactForm
        contact={contact}
        formId={FORM_ID}
        onSubmittingChange={setSubmitting}
        onSubmitted={() => {
          reloadList();
          void close();
        }}
        onNotFound={() => {
          reload();
          reloadList();
        }}
      />
    );
  }

  return (
    <RouteDialog
      title={t('sales.contacts.form.editTitle')}
      footer={
        notFound ? (
          <Button variant='outline' onClick={() => void close()}>
            {t('actions.close')}
          </Button>
        ) : (
          <>
            <Button
              variant='outline'
              onClick={() => void close()}
              disabled={submitting}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              type='submit'
              form={FORM_ID}
              disabled={submitting || contact === undefined}
            >
              {submitting ? <Spinner data-icon='inline-start' /> : null}
              {submitting ? t('actions.saving') : t('actions.save')}
            </Button>
          </>
        )
      }
    >
      {body}
    </RouteDialog>
  );
}
