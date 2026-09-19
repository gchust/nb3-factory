import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useState } from 'react';

import { RentalErrorMessage } from '@/components/rental-error';
import { SelectField } from '@/components/select-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  createBooking,
  listOwners,
  listTenants,
  listVenues,
  toDateTimeInputValue,
  type RentalOwner,
  type Tenant,
  type Venue,
} from '@/lib/rentals';
import { useApiData } from '@/lib/use-api-data';

export interface NewBookingDialogProps {
  readonly open: boolean;
  readonly canAssignOwner: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated: () => void;
}

function defaultRange(): { start: string; end: string } {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    start: toDateTimeInputValue(start),
    end: toDateTimeInputValue(end),
  };
}

export function NewBookingDialog({
  open,
  canAssignOwner,
  onOpenChange,
  onCreated,
}: NewBookingDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const range = defaultRange();
  const [venueId, setVenueId] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [title, setTitle] = useState('');
  const [startAt, setStartAt] = useState(range.start);
  const [endAt, setEndAt] = useState(range.end);
  const [feeOverride, setFeeOverride] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const venues = useApiData<readonly Venue[]>('booking-form:venues', (client) =>
    listVenues(client, { status: 'available' }),
  );
  const tenants = useApiData<readonly Tenant[]>(
    'booking-form:tenants',
    (client) => listTenants(client),
  );
  const owners = useApiData<readonly RentalOwner[]>(
    canAssignOwner ? 'booking-form:owners' : 'booking-form:owners:skip',
    (client) => (canAssignOwner ? listOwners(client) : Promise.resolve([])),
  );

  const selectedVenue = venues.data?.find(
    (venue) => String(venue.id) === venueId,
  );
  // The fee defaults to the venue's hourly price over the selected range, but
  // an explicit value typed by the user always wins.
  const suggestedFee = (() => {
    if (!selectedVenue) return '';
    const start = new Date(startAt).getTime();
    const end = new Date(endAt).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return '';
    const hours = (end - start) / 3600000;
    return String(Math.round(hours * selectedVenue.unitPrice * 100) / 100);
  })();
  const fee = feeOverride ?? suggestedFee;

  async function submit(): Promise<void> {
    setError(null);
    const start = new Date(startAt);
    const end = new Date(endAt);
    if (
      !venueId ||
      !tenantId ||
      !title.trim() ||
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    ) {
      setError({ code: 'VALIDATION_FAILED' });
      return;
    }

    setSubmitting(true);
    try {
      await createBooking(api, {
        venueId: Number(venueId),
        tenantId: Number(tenantId),
        title: title.trim(),
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        fee: fee === '' ? undefined : Number(fee),
        ownerId: canAssignOwner && ownerId ? ownerId : undefined,
        note: note.trim() || undefined,
      });
      onOpenChange(false);
      onCreated();
    } catch (cause: unknown) {
      setError(cause);
    } finally {
      setSubmitting(false);
    }
  }

  const venueOptions =
    venues.data?.map((venue) => ({
      value: String(venue.id),
      label: `${venue.name} · ${venue.location} · ${venue.unitPrice}`,
    })) ?? [];
  const tenantOptions =
    tenants.data?.map((tenant) => ({
      value: String(tenant.id),
      label: tenant.name,
    })) ?? [];
  const ownerOptions = [
    { value: '', label: t('rentals.form.ownerSelf') },
    ...(owners.data?.map((owner) => ({
      value: owner.id,
      label: owner.name,
    })) ?? []),
  ];

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{t('rentals.form.createTitle')}</DialogTitle>
          <DialogDescription>
            {t('rentals.form.createDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='space-y-1.5'>
            <Label htmlFor='booking-venue'>
              {t('rentals.fields.venueName')}
            </Label>
            <SelectField
              ariaLabel={t('rentals.fields.venueName')}
              id='booking-venue'
              onChange={setVenueId}
              options={venueOptions}
              placeholder={t('rentals.form.selectVenue')}
              value={venueId}
            />
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='booking-tenant'>
              {t('rentals.fields.tenantName')}
            </Label>
            <SelectField
              ariaLabel={t('rentals.fields.tenantName')}
              id='booking-tenant'
              onChange={setTenantId}
              options={tenantOptions}
              placeholder={t('rentals.form.selectTenant')}
              value={tenantId}
            />
          </div>

          <div className='space-y-1.5 sm:col-span-2'>
            <Label htmlFor='booking-title'>{t('rentals.fields.title')}</Label>
            <Input
              id='booking-title'
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t('rentals.form.titlePlaceholder')}
              value={title}
            />
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='booking-start'>{t('rentals.fields.startAt')}</Label>
            <Input
              id='booking-start'
              onChange={(event) => setStartAt(event.target.value)}
              type='datetime-local'
              value={startAt}
            />
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='booking-end'>{t('rentals.fields.endAt')}</Label>
            <Input
              id='booking-end'
              onChange={(event) => setEndAt(event.target.value)}
              type='datetime-local'
              value={endAt}
            />
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='booking-fee'>{t('rentals.fields.fee')}</Label>
            <Input
              id='booking-fee'
              min='0'
              onChange={(event) => setFeeOverride(event.target.value)}
              step='0.01'
              type='number'
              value={fee}
            />
          </div>
          {canAssignOwner ? (
            <div className='space-y-1.5'>
              <Label htmlFor='booking-owner'>{t('rentals.fields.owner')}</Label>
              <SelectField
                ariaLabel={t('rentals.fields.owner')}
                id='booking-owner'
                onChange={setOwnerId}
                options={ownerOptions}
                value={ownerId}
              />
            </div>
          ) : null}

          <div className='space-y-1.5 sm:col-span-2'>
            <Label htmlFor='booking-note'>{t('rentals.fields.note')}</Label>
            <textarea
              className='min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'
              id='booking-note'
              onChange={(event) => setNote(event.target.value)}
              placeholder={t('rentals.form.notePlaceholder')}
              value={note}
            />
          </div>
        </div>

        <RentalErrorMessage error={error} />
        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            type='button'
            variant='outline'
          >
            {t('actions.cancel')}
          </Button>
          <Button
            disabled={submitting}
            onClick={() => {
              void submit();
            }}
            type='button'
          >
            {submitting ? t('rentals.form.saving') : t('rentals.form.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
