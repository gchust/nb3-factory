import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { fetchContact } from '../api.js';
import { ContactForm } from '../contact-form.js';
import type { Contact, ContactsOutletContext } from '../types.js';

const FORM_ID = 'crm-contact-edit-form';

export default function EditContactPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const params = useParams();
  const contactId = params.contactId ?? '';
  const { reload } = useOutletContext<ContactsOutletContext>();

  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  const [reloadCount, retry] = useReducer((count: number) => count + 1, 0);
  const [state, setState] = useState<{
    readonly key: string;
    readonly contact?: Contact;
    readonly error?: unknown;
    readonly missing?: boolean;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = String(reloadCount);
    fetchContact(api, contactId, controller.signal).then(
      (contact) => {
        if (!controller.signal.aborted) setState({ key, contact });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiClientError && error.status === 404) {
          setState({ key, missing: true });
          return;
        }
        setState({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, contactId, reloadCount]);

  const current = state?.key === String(reloadCount) ? state : undefined;

  if (current?.missing) {
    return <MissingDialog />;
  }

  return (
    <RouteDialog
      title={t('crm.contact.edit.title')}
      description={t('crm.contact.form.description')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={<EditContactFooter submitting={submitting} />}
    >
      {current?.error ? (
        <Alert variant='destructive'>
          <AlertCircleIcon />
          <AlertTitle>{t('crm.error.title')}</AlertTitle>
          <AlertDescription>{t('crm.error.requestFailed')}</AlertDescription>
          <AlertAction>
            <Button variant='outline' size='sm' onClick={retry}>
              {t('status.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : current?.contact ? (
        <EditContactBody
          contact={current.contact}
          onSubmittingChange={handleSubmittingChange}
          onSubmitted={() => {
            reload();
          }}
        />
      ) : (
        <Skeleton className='h-56' />
      )}
    </RouteDialog>
  );
}

function EditContactBody({
  contact,
  onSubmittingChange,
  onSubmitted,
}: {
  readonly contact: Contact;
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onSubmitted: () => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  return (
    <ContactForm
      contact={contact}
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onSubmitted={() => {
        onSubmitted();
        void close();
      }}
    />
  );
}

/** Editing found the record deleted: explain it and offer only "Close" (guideline R3). */
function MissingDialog(): ReactElement {
  const { t } = useTranslation();
  return (
    <RouteDialog
      title={t('crm.contact.edit.title')}
      footer={<MissingDialogFooter />}
    >
      <Alert>
        <AlertCircleIcon />
        <AlertTitle>{t('crm.record.notFound.title')}</AlertTitle>
        <AlertDescription>
          {t('crm.record.notFound.description')}
        </AlertDescription>
      </Alert>
    </RouteDialog>
  );
}

function MissingDialogFooter(): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <Button variant='outline' onClick={() => void close()}>
      {t('routeOverlay.close')}
    </Button>
  );
}

function EditContactFooter({
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
        {submitting ? t('actions.saving') : t('actions.save')}
      </Button>
    </>
  );
}
