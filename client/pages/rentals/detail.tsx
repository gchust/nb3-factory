import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeft } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { BookingStatusBadge } from '@/components/booking-status-badge';
import { BookingAttachments } from '@/components/attachments/booking-attachments';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import { RentalErrorMessage } from '@/components/rental-error';
import { Button } from '@/components/ui/button';
import {
  confirmBooking,
  fetchIdentity,
  formatDateTime,
  formatMoney,
  getBooking,
  settleBooking,
  type Booking,
} from '@/lib/rentals';
import { useApiData } from '@/lib/use-api-data';

import {
  CancelDialog,
  DeliverDialog,
  ReassignDialog,
  ReturnDialog,
} from './action-dialogs.js';

type DialogKind = 'deliver' | 'return' | 'cancel' | 'reassign' | null;

function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='mt-0.5 text-sm'>{children}</dd>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section className='rounded-xl border border-border bg-card p-4'>
      <h2 className='font-heading text-base font-medium'>{title}</h2>
      <div className='mt-3'>{children}</div>
    </section>
  );
}

export default function RentalDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const params = useParams();
  const id = Number(params.id);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);

  const booking = useApiData<Booking>(`booking:${params.id ?? ''}`, (client) =>
    getBooking(client, id),
  );
  const identity = useApiData('rentals:identity', (client) =>
    fetchIdentity(client),
  );

  const value = booking.data;
  const role = identity.data?.role;
  const isOwner = Boolean(value && identity.data?.userId === value.ownerId);
  const canManage = role === 'manager';
  const canOperate = canManage || isOwner;

  async function runAction(action: () => Promise<unknown>): Promise<void> {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      booking.reload();
    } catch (cause: unknown) {
      setActionError(cause);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageContainer className='mx-auto max-w-5xl'>
      <Button render={<Link to='/rentals' />} size='sm' variant='ghost'>
        <ArrowLeft />
        {t('rentals.detail.back')}
      </Button>

      <QueryState
        emptyDescription={t('rentals.detail.notFoundHint')}
        emptyTitle={t('rentals.detail.notFound')}
        error={booking.error}
        isEmpty={!booking.loading && !booking.error && !value}
        loading={booking.loading}
        onRetry={booking.reload}
      >
        {value ? (
          <>
            <PageHeader
              description={
                <span className='flex items-center gap-2'>
                  <span className='font-mono text-xs'>{value.reference}</span>
                  <BookingStatusBadge status={value.status} />
                </span>
              }
              title={value.title}
            />

            <div className='flex flex-wrap items-center gap-2'>
              {value.status === 'pending' && canManage ? (
                <Button
                  disabled={busy}
                  onClick={() => {
                    void runAction(() => confirmBooking(api, value.id));
                  }}
                  type='button'
                >
                  {t('rentals.actions.confirm')}
                </Button>
              ) : null}
              {value.status === 'confirmed' && canOperate ? (
                <Button onClick={() => setDialog('deliver')} type='button'>
                  {t('rentals.actions.deliver')}
                </Button>
              ) : null}
              {value.status === 'delivered' && canOperate ? (
                <Button onClick={() => setDialog('return')} type='button'>
                  {t('rentals.actions.return')}
                </Button>
              ) : null}
              {value.status === 'returned' && canManage ? (
                <Button
                  disabled={busy}
                  onClick={() => {
                    void runAction(() => settleBooking(api, value.id));
                  }}
                  type='button'
                >
                  {t('rentals.actions.settle')}
                </Button>
              ) : null}
              {(value.status === 'pending' || value.status === 'confirmed') &&
              canOperate ? (
                <Button
                  onClick={() => setDialog('cancel')}
                  type='button'
                  variant='outline'
                >
                  {t('rentals.actions.cancel')}
                </Button>
              ) : null}
              {canManage &&
              value.status !== 'settled' &&
              value.status !== 'cancelled' ? (
                <Button
                  onClick={() => setDialog('reassign')}
                  type='button'
                  variant='outline'
                >
                  {t('rentals.actions.reassign')}
                </Button>
              ) : null}
            </div>
            <RentalErrorMessage error={actionError} />

            <Section title={t('rentals.detail.bookingInfo')}>
              <dl className='grid gap-4 sm:grid-cols-3'>
                <Field label={t('rentals.fields.venueName')}>
                  {value.venueName ?? '—'}
                  {value.venueLocation ? (
                    <span className='text-muted-foreground'>
                      {' '}
                      · {value.venueLocation}
                    </span>
                  ) : null}
                </Field>
                <Field label={t('rentals.fields.tenantName')}>
                  {value.tenantName ?? '—'}
                </Field>
                <Field label={t('rentals.fields.owner')}>
                  {value.ownerName ?? '—'}
                </Field>
                <Field label={t('rentals.fields.startAt')}>
                  {formatDateTime(value.startAt)}
                </Field>
                <Field label={t('rentals.fields.endAt')}>
                  {formatDateTime(value.endAt)}
                </Field>
                <Field label={t('rentals.fields.fee')}>
                  {formatMoney(value.fee)}
                </Field>
                <Field label={t('rentals.fields.note')}>
                  {value.note ?? '—'}
                </Field>
                <Field label={t('rentals.fields.confirmedAt')}>
                  {formatDateTime(value.confirmedAt)}
                </Field>
                <Field label={t('rentals.fields.settledAt')}>
                  {formatDateTime(value.settledAt)}
                </Field>
              </dl>
            </Section>

            <Section title={t('rentals.detail.handover')}>
              <dl className='grid gap-4 sm:grid-cols-3'>
                <Field label={t('rentals.fields.deliveryCondition')}>
                  {value.deliveryCondition ?? '—'}
                </Field>
                <Field label={t('rentals.fields.deliveredAt')}>
                  {formatDateTime(value.deliveredAt)}
                </Field>
                <Field label={t('rentals.fields.returnCondition')}>
                  {value.returnCondition ?? '—'}
                </Field>
                <Field label={t('rentals.fields.returnedAt')}>
                  {formatDateTime(value.returnedAt)}
                </Field>
                <Field label={t('rentals.fields.damageNote')}>
                  {value.damageNote ?? '—'}
                </Field>
                <Field label={t('rentals.fields.damageFee')}>
                  {value.damageFee === null
                    ? '—'
                    : formatMoney(value.damageFee)}
                </Field>
              </dl>
            </Section>

            {value.status === 'cancelled' ? (
              <Section title={t('rentals.detail.cancellation')}>
                <dl className='grid gap-4 sm:grid-cols-2'>
                  <Field label={t('rentals.fields.cancelReason')}>
                    {value.cancelReason ?? '—'}
                  </Field>
                  <Field label={t('rentals.fields.cancelledAt')}>
                    {formatDateTime(value.cancelledAt)}
                  </Field>
                </dl>
              </Section>
            ) : null}

            <BookingAttachments
              bookingId={value.id}
              canModify={value.status !== 'settled' && (canManage || isOwner)}
              readOnly={value.status === 'settled'}
            />

            {dialog === 'deliver' ? (
              <DeliverDialog
                booking={value}
                onDone={booking.reload}
                onOpenChange={(open) => setDialog(open ? 'deliver' : null)}
                open
              />
            ) : null}
            {dialog === 'return' ? (
              <ReturnDialog
                booking={value}
                onDone={booking.reload}
                onOpenChange={(open) => setDialog(open ? 'return' : null)}
                open
              />
            ) : null}
            {dialog === 'cancel' ? (
              <CancelDialog
                booking={value}
                onDone={booking.reload}
                onOpenChange={(open) => setDialog(open ? 'cancel' : null)}
                open
              />
            ) : null}
            {dialog === 'reassign' ? (
              <ReassignDialog
                booking={value}
                onDone={booking.reload}
                onOpenChange={(open) => setDialog(open ? 'reassign' : null)}
                open
              />
            ) : null}
          </>
        ) : null}
      </QueryState>
    </PageContainer>
  );
}
