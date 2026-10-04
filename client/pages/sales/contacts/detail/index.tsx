import { ApiClientError } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { PencilIcon, Trash2Icon } from 'lucide-react';
import { type ReactElement, type ReactNode, useMemo, useState } from 'react';
import { Link, Outlet, useParams } from 'react-router';

import { RouteDrawer } from '@/components/route-drawer';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import { SalesDeleteDialog } from '../../sales-delete-dialog';
import {
  formatDate,
  salesErrorMessageKey,
  useApiQuery,
  type Contact,
} from '../../shared';

/** Route `/sales/contacts/:contactId`: the contact detail drawer. */
export default function ContactDetailPage(): ReactElement {
  const { contactId = '' } = useParams();
  // Key by id so forward and back to another record start the drawer over rather than showing the previous record.
  return <ContactDetail key={contactId} contactId={contactId} />;
}

function ContactDetail({
  contactId,
}: {
  readonly contactId: string;
}): ReactElement {
  const { t } = useTranslation();
  const request = useMemo(
    () => ({ path: `sales/contacts/${encodeURIComponent(contactId)}` }),
    [contactId],
  );
  const { data, error, loading } = useApiQuery<Contact>(request);
  const [deleting, setDeleting] = useState(false);
  const [gone, setGone] = useState(false);

  const notFound =
    gone || (error instanceof ApiClientError && error.status === 404);

  return (
    <>
      <RouteDrawer
        title={data?.name ?? t('sales.contact.detailTitle')}
        description={data?.customerName ?? undefined}
        footer={
          notFound ? undefined : (
            <ContactDetailFooter
              ready={data !== undefined}
              onDelete={() => setDeleting(true)}
            />
          )
        }
      >
        {notFound ? (
          <ContactMissing />
        ) : error && !loading ? (
          <p className='text-sm text-destructive' role='alert'>
            {t(salesErrorMessageKey(error))}
          </p>
        ) : loading || !data ? (
          <div className='space-y-4'>
            <Skeleton className='h-16 w-full' />
            <Skeleton className='h-16 w-full' />
            <Skeleton className='h-16 w-full' />
          </div>
        ) : (
          <ContactFields contact={data} />
        )}
        {/* The edit dialog stacks on the drawer, so its outlet belongs inside it. */}
        <Outlet />
      </RouteDrawer>

      <SalesDeleteDialog
        open={deleting}
        onOpenChange={setDeleting}
        resource='contacts'
        record={data ?? null}
        onDeleted={() => {
          setDeleting(false);
          setGone(true);
        }}
      />
    </>
  );
}

function ContactFields({
  contact,
}: {
  readonly contact: Contact;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  return (
    <dl className='divide-y'>
      <DetailRow label={t('sales.contact.customer')}>
        {contact.customerName ?? '—'}
      </DetailRow>
      <DetailRow label={t('sales.contact.phone')}>
        {contact.phone ? (
          <a
            className='underline-offset-4 hover:underline'
            href={`tel:${contact.phone}`}
          >
            {contact.phone}
          </a>
        ) : (
          '—'
        )}
      </DetailRow>
      <DetailRow label={t('sales.contact.email')}>
        {contact.email ? (
          <a
            className='underline-offset-4 hover:underline'
            href={`mailto:${contact.email}`}
          >
            {contact.email}
          </a>
        ) : (
          '—'
        )}
      </DetailRow>
      <DetailRow label={t('sales.contact.createdAt')}>
        {formatDate(locale, contact.createdAt)}
      </DetailRow>
      <DetailRow label={t('sales.contact.updatedAt')}>
        {formatDate(locale, contact.updatedAt)}
      </DetailRow>
    </dl>
  );
}

function DetailRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className='grid grid-cols-3 items-start gap-3 py-3 text-sm'>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className='col-span-2 break-words'>{children}</dd>
    </div>
  );
}

// useRouteOverlay() is only reachable inside the drawer, so the buttons are their own component.
function ContactDetailFooter({
  ready,
  onDelete,
}: {
  readonly ready: boolean;
  readonly onDelete: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const { close, isClosing } = useRouteOverlay();
  return (
    <>
      <Button
        type='button'
        variant='destructive'
        disabled={isClosing}
        onClick={onDelete}
      >
        <Trash2Icon data-icon='inline-start' />
        {t('sales.contact.delete')}
      </Button>
      <Button
        variant='outline'
        disabled={!ready || isClosing}
        nativeButton={false}
        render={<Link to='edit' relative='path' />}
      >
        <PencilIcon data-icon='inline-start' />
        {t('sales.contact.edit')}
      </Button>
      <Button type='button' disabled={isClosing} onClick={() => void close()}>
        {t('actions.close')}
      </Button>
    </>
  );
}

// The record is gone: the drawer says so and offers to leave, rather than a form over a missing row.
function ContactMissing(): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <div className='space-y-4'>
      <p className='text-sm text-destructive'>
        {t('sales.errors.contactNotFound')}
      </p>
      <Button variant='outline' onClick={() => void close()}>
        {t('sales.actions.backToList')}
      </Button>
    </div>
  );
}
