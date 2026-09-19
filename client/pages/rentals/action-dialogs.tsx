import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement, ReactNode } from 'react';
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
  cancelBooking,
  deliverBooking,
  listOwners,
  reassignOwner,
  returnBooking,
  type Booking,
} from '@/lib/rentals';
import { useApiData } from '@/lib/use-api-data';

interface BaseDialogProps {
  readonly booking: Booking;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onDone: () => void;
}

function Textarea({
  id,
  value,
  onChange,
  placeholder,
}: {
  readonly id: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
}): ReactElement {
  return (
    <textarea
      className='min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'
      id={id}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      value={value}
    />
  );
}

function FormShell({
  open,
  onOpenChange,
  title,
  description,
  error,
  busy,
  submitLabel,
  onSubmit,
  children,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description: string;
  readonly error: unknown;
  readonly busy: boolean;
  readonly submitLabel: string;
  readonly onSubmit: () => void;
  readonly children: ReactNode;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className='space-y-4'>{children}</div>
        <RentalErrorMessage error={error} />
        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            type='button'
            variant='outline'
          >
            {t('actions.cancel')}
          </Button>
          <Button disabled={busy} onClick={onSubmit} type='button'>
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeliverDialog({
  booking,
  open,
  onOpenChange,
  onDone,
}: BaseDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [condition, setCondition] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await deliverBooking(api, booking.id, { condition: condition.trim() });
      onOpenChange(false);
      onDone();
    } catch (cause: unknown) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormShell
      busy={busy}
      description={t('rentals.actions.deliverDescription')}
      error={error}
      onOpenChange={onOpenChange}
      onSubmit={() => {
        void submit();
      }}
      open={open}
      submitLabel={t('rentals.actions.deliver')}
      title={t('rentals.actions.deliverTitle')}
    >
      <div className='space-y-1.5'>
        <Label htmlFor='deliver-condition'>
          {t('rentals.fields.deliveryCondition')}
        </Label>
        <Textarea
          id='deliver-condition'
          onChange={setCondition}
          placeholder={t('rentals.form.conditionPlaceholder')}
          value={condition}
        />
      </div>
    </FormShell>
  );
}

export function ReturnDialog({
  booking,
  open,
  onOpenChange,
  onDone,
}: BaseDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [condition, setCondition] = useState('');
  const [damageNote, setDamageNote] = useState('');
  const [damageFee, setDamageFee] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await returnBooking(api, booking.id, {
        condition: condition.trim(),
        damageNote: damageNote.trim() || undefined,
        damageFee: damageFee === '' ? undefined : Number(damageFee),
      });
      onOpenChange(false);
      onDone();
    } catch (cause: unknown) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormShell
      busy={busy}
      description={t('rentals.actions.returnDescription')}
      error={error}
      onOpenChange={onOpenChange}
      onSubmit={() => {
        void submit();
      }}
      open={open}
      submitLabel={t('rentals.actions.return')}
      title={t('rentals.actions.returnTitle')}
    >
      <div className='space-y-1.5'>
        <Label htmlFor='return-condition'>
          {t('rentals.fields.returnCondition')}
        </Label>
        <Textarea
          id='return-condition'
          onChange={setCondition}
          placeholder={t('rentals.form.conditionPlaceholder')}
          value={condition}
        />
      </div>
      <div className='space-y-1.5'>
        <Label htmlFor='damage-note'>{t('rentals.fields.damageNote')}</Label>
        <Textarea
          id='damage-note'
          onChange={setDamageNote}
          placeholder={t('rentals.form.damagePlaceholder')}
          value={damageNote}
        />
      </div>
      <div className='space-y-1.5'>
        <Label htmlFor='damage-fee'>{t('rentals.fields.damageFee')}</Label>
        <Input
          id='damage-fee'
          min='0'
          onChange={(event) => setDamageFee(event.target.value)}
          step='0.01'
          type='number'
          value={damageFee}
        />
      </div>
    </FormShell>
  );
}

export function CancelDialog({
  booking,
  open,
  onOpenChange,
  onDone,
}: BaseDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await cancelBooking(api, booking.id, {
        reason: reason.trim() || undefined,
      });
      onOpenChange(false);
      onDone();
    } catch (cause: unknown) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormShell
      busy={busy}
      description={t('rentals.actions.cancelDescription')}
      error={error}
      onOpenChange={onOpenChange}
      onSubmit={() => {
        void submit();
      }}
      open={open}
      submitLabel={t('rentals.actions.cancel')}
      title={t('rentals.actions.cancelTitle')}
    >
      <div className='space-y-1.5'>
        <Label htmlFor='cancel-reason'>
          {t('rentals.fields.cancelReason')}
        </Label>
        <Textarea
          id='cancel-reason'
          onChange={setReason}
          placeholder={t('rentals.form.cancelPlaceholder')}
          value={reason}
        />
      </div>
    </FormShell>
  );
}

export function ReassignDialog({
  booking,
  open,
  onOpenChange,
  onDone,
}: BaseDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [ownerId, setOwnerId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const owners = useApiData('reassign:owners', (client) => listOwners(client));

  async function submit(): Promise<void> {
    if (!ownerId) {
      setError({ code: 'VALIDATION_FAILED' });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await reassignOwner(api, booking.id, ownerId);
      onOpenChange(false);
      onDone();
    } catch (cause: unknown) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormShell
      busy={busy}
      description={t('rentals.actions.reassignDescription')}
      error={error}
      onOpenChange={onOpenChange}
      onSubmit={() => {
        void submit();
      }}
      open={open}
      submitLabel={t('rentals.actions.reassign')}
      title={t('rentals.actions.reassignTitle')}
    >
      <div className='space-y-1.5'>
        <Label htmlFor='reassign-owner'>{t('rentals.fields.owner')}</Label>
        <SelectField
          ariaLabel={t('rentals.fields.owner')}
          id='reassign-owner'
          onChange={setOwnerId}
          options={
            owners.data?.map((owner) => ({
              value: owner.id,
              label: owner.name,
            })) ?? []
          }
          placeholder={t('rentals.form.selectOwner')}
          value={ownerId}
        />
      </div>
    </FormShell>
  );
}
