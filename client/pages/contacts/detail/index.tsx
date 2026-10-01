import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import {
  Link,
  Outlet,
  useLocation,
  useOutletContext,
  useParams,
} from 'react-router';

import { RouteDrawer } from '@/components/route-drawer';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import { fetchContact } from '../../crm/crm-api.js';
import {
  displayText,
  type Contact,
  type DetailOutletContext,
  type ListOutletContext,
} from '../../crm/types.js';

/** Route `/contacts/:contactId`: the contact detail drawer. */
export default function ContactDetailPage(): ReactElement {
  const { contactId = '' } = useParams();
  return <ContactDetail key={contactId} contactId={contactId} />;
}

function ContactDetail({
  contactId,
}: {
  readonly contactId: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { reload: reloadList } = useOutletContext<ListOutletContext>();

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${contactId}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly contact?: Contact;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = `${contactId}:${reloadCount}`;
    fetchContact(api, Number(contactId), controller.signal).then(
      (contact) => {
        if (!controller.signal.aborted) setResult({ key, contact });
      },
      (caught: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ key, error: caught });
        if (caught instanceof ApiClientError && caught.status === 404) {
          reloadList();
        }
      },
    );
    return () => controller.abort();
  }, [api, contactId, reloadCount, reloadList]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;

  const [saved, setSaved] = useState<Contact>();
  const [gone, setGone] = useState(false);

  const notFound = gone || status === 404;
  const contact = notFound ? undefined : (saved ?? result?.contact);

  const outletContext = useMemo<DetailOutletContext<Contact>>(
    () => ({
      onSaved: (updated) => {
        setSaved(updated);
        reloadList();
      },
      onNotFound: () => {
        setGone(true);
        reloadList();
      },
    }),
    [reloadList],
  );

  let body: ReactElement;
  if (notFound || status === 403) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {notFound
            ? t('crm.contact.error.notFound')
            : t('crm.error.forbidden')}
        </AlertDescription>
      </Alert>
    );
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {t('crm.contact.error.requestFailed')}
        </AlertDescription>
        <AlertAction>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setReloadCount((count) => count + 1)}
          >
            {t('status.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (!contact) {
    body = (
      <div role='status' aria-label={t('status.loading')} className='space-y-3'>
        <Skeleton className='h-4 w-1/2' />
        <Skeleton className='h-4 w-1/3' />
        <Skeleton className='h-4 w-2/3' />
      </div>
    );
  } else {
    body = <ContactFields contact={contact} />;
  }

  return (
    <RouteDrawer
      title={contact?.name ?? t('crm.contact.detail.title')}
      footer={contact ? <ContactDetailActions /> : undefined}
    >
      {body}
      <Outlet context={outletContext} />
    </RouteDrawer>
  );
}

function ContactDetailActions(): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  return (
    <Button
      nativeButton={false}
      render={<Link to={{ pathname: 'edit', search: location.search }} />}
    >
      {t('crm.contact.actions.edit')}
    </Button>
  );
}

function ContactFields({
  contact,
}: {
  readonly contact: Contact;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );

  return (
    <dl className='grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3 text-sm'>
      <dt className='text-muted-foreground'>
        {t('crm.contact.fields.customer')}
      </dt>
      <dd className='min-w-0 wrap-anywhere'>
        {displayText(contact.customerName)}
      </dd>
      <dt className='text-muted-foreground'>{t('crm.contact.fields.phone')}</dt>
      <dd className='min-w-0 wrap-anywhere'>{displayText(contact.phone)}</dd>
      <dt className='text-muted-foreground'>{t('crm.contact.fields.email')}</dt>
      <dd className='min-w-0 wrap-anywhere'>{displayText(contact.email)}</dd>
      <dt className='text-muted-foreground'>
        {t('crm.contact.fields.createdAt')}
      </dt>
      <dd>{dateFormat.format(new Date(contact.createdAt))}</dd>
      <dt className='text-muted-foreground'>
        {t('crm.contact.fields.updatedAt')}
      </dt>
      <dd>{dateFormat.format(new Date(contact.updatedAt))}</dd>
    </dl>
  );
}
