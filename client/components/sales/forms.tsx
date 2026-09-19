import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorNotice, SelectInput, TextArea } from '@/components/sales/ui';
import {
  CHANNELS,
  STAGES,
  errorMessage,
  nowLocalInput,
  useSalesApi,
  type Channel,
  type Contact,
  type CustomerSummary,
  type FollowUp,
  type Opportunity,
  type OpportunityPayload,
  type Stage,
} from '@/lib/sales';

/**
 * Create/edit dialogs for contacts, opportunities and follow-ups.
 *
 * Each dialog is mounted by its parent only while it is open (and keyed by the
 * record it edits), so form state starts from the record being edited without
 * an effect that copies props into state.
 */

export function ContactFormDialog({
  customerId,
  contact,
  onClose,
  onSaved,
}: {
  readonly customerId: string;
  readonly contact?: Contact;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useSalesApi();
  const [name, setName] = useState(() => contact?.name ?? '');
  const [title, setTitle] = useState(() => contact?.title ?? '');
  const [phone, setPhone] = useState(() => contact?.phone ?? '');
  const [email, setEmail] = useState(() => contact?.email ?? '');
  const [isPrimary, setIsPrimary] = useState(() => contact?.isPrimary ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      const payload = {
        name: name.trim(),
        title: title.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        isPrimary,
      };
      if (contact) await api.updateContact(contact.id, payload);
      else await api.createContact(customerId, payload);
      onSaved();
    } catch (cause: unknown) {
      setError(errorMessage(cause) || t('sales.common.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(value) => (value ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {contact ? t('sales.contacts.edit') : t('sales.contacts.create')}
          </DialogTitle>
        </DialogHeader>
        <form
          className='space-y-3'
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className='space-y-1'>
            <Label htmlFor='contact-name'>
              {t('sales.fields.contactName')}
            </Label>
            <Input
              id='contact-name'
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className='space-y-1'>
            <Label htmlFor='contact-title'>{t('sales.fields.title')}</Label>
            <Input
              id='contact-title'
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='space-y-1'>
              <Label htmlFor='contact-phone'>{t('sales.fields.phone')}</Label>
              <Input
                id='contact-phone'
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </div>
            <div className='space-y-1'>
              <Label htmlFor='contact-email'>{t('sales.fields.email')}</Label>
              <Input
                id='contact-email'
                type='email'
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          </div>
          <label className='flex items-center gap-2 text-sm'>
            <input
              type='checkbox'
              checked={isPrimary}
              onChange={(event) => setIsPrimary(event.target.checked)}
            />
            {t('sales.fields.isPrimary')}
          </label>
          <ErrorNotice message={error} />
          <DialogFooter>
            <Button type='button' variant='outline' onClick={onClose}>
              {t('actions.cancel')}
            </Button>
            <Button type='submit' disabled={busy || !name.trim()}>
              {busy ? t('sales.common.saving') : t('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function OpportunityFormDialog({
  customerId,
  customers,
  opportunity,
  onClose,
  onSaved,
}: {
  readonly customerId?: string;
  readonly customers?: readonly CustomerSummary[];
  readonly opportunity?: Opportunity;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useSalesApi();
  const [selectedCustomer, setSelectedCustomer] = useState(
    () => opportunity?.customerId ?? customerId ?? '',
  );
  const [name, setName] = useState(() => opportunity?.name ?? '');
  const [amount, setAmount] = useState(() => String(opportunity?.amount ?? 0));
  const [expected, setExpected] = useState(
    () => opportunity?.expectedCloseDate ?? '',
  );
  const [stage, setStage] = useState<Stage>(
    () => opportunity?.stage ?? 'initial_contact',
  );
  const [closeReason, setCloseReason] = useState(
    () => opportunity?.closeReason ?? '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const closed = stage === 'won' || stage === 'lost';
  const chooseCustomer = !customerId && !opportunity && customers !== undefined;

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      const payload: OpportunityPayload = {
        customerId: selectedCustomer,
        name: name.trim(),
        amount: Number(amount) || 0,
        expectedCloseDate: expected || null,
        stage,
        closeReason: closed ? closeReason.trim() : null,
      };
      if (opportunity) {
        await api.updateOpportunity(opportunity.id, {
          name: payload.name,
          amount: payload.amount,
          expectedCloseDate: payload.expectedCloseDate,
          stage: payload.stage,
          closeReason: payload.closeReason,
        });
      } else {
        await api.createOpportunity(payload);
      }
      onSaved();
    } catch (cause: unknown) {
      setError(errorMessage(cause) || t('sales.common.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(value) => (value ? undefined : onClose())}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>
            {opportunity
              ? t('sales.opportunities.edit')
              : t('sales.opportunities.create')}
          </DialogTitle>
        </DialogHeader>
        <form
          className='space-y-3'
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {chooseCustomer ? (
            <div className='space-y-1'>
              <Label htmlFor='opportunity-customer'>
                {t('sales.fields.customer')}
              </Label>
              <SelectInput
                id='opportunity-customer'
                required
                value={selectedCustomer}
                onChange={(event) => setSelectedCustomer(event.target.value)}
              >
                <option value=''>
                  {t('sales.opportunities.chooseCustomer')}
                </option>
                {(customers ?? []).map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </SelectInput>
            </div>
          ) : null}
          <div className='space-y-1'>
            <Label htmlFor='opportunity-name'>
              {t('sales.fields.opportunityName')}
            </Label>
            <Input
              id='opportunity-name'
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='space-y-1'>
              <Label htmlFor='opportunity-amount'>
                {t('sales.fields.amount')}
              </Label>
              <Input
                id='opportunity-amount'
                type='number'
                min='0'
                step='0.01'
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div className='space-y-1'>
              <Label htmlFor='opportunity-expected'>
                {t('sales.fields.expectedCloseDate')}
              </Label>
              <Input
                id='opportunity-expected'
                type='date'
                value={expected}
                onChange={(event) => setExpected(event.target.value)}
              />
            </div>
          </div>
          <div className='space-y-1'>
            <Label htmlFor='opportunity-stage'>{t('sales.fields.stage')}</Label>
            <SelectInput
              id='opportunity-stage'
              value={stage}
              onChange={(event) => setStage(event.target.value as Stage)}
            >
              {STAGES.map((item) => (
                <option key={item} value={item}>
                  {t(`sales.stage.${item}`)}
                </option>
              ))}
            </SelectInput>
          </div>
          {closed ? (
            <div className='space-y-1'>
              <Label htmlFor='opportunity-reason'>
                {t('sales.fields.closeReason')}
              </Label>
              <TextArea
                id='opportunity-reason'
                required
                value={closeReason}
                onChange={(event) => setCloseReason(event.target.value)}
                placeholder={t('sales.opportunities.closeReasonHint')}
              />
            </div>
          ) : null}
          <ErrorNotice message={error} />
          <DialogFooter>
            <Button type='button' variant='outline' onClick={onClose}>
              {t('actions.cancel')}
            </Button>
            <Button
              type='submit'
              disabled={
                busy ||
                !name.trim() ||
                !selectedCustomer ||
                (closed && !closeReason.trim())
              }
            >
              {busy ? t('sales.common.saving') : t('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function FollowUpFormDialog({
  customerId,
  customers,
  followUp,
  onClose,
  onSaved,
}: {
  readonly customerId?: string;
  readonly customers?: readonly CustomerSummary[];
  readonly followUp?: FollowUp;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useSalesApi();
  const [selectedCustomer, setSelectedCustomer] = useState(
    () => followUp?.customerId ?? customerId ?? '',
  );
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [opportunityId, setOpportunityId] = useState(
    () => followUp?.opportunityId ?? '',
  );
  const [channel, setChannel] = useState<Channel>(
    () => followUp?.channel ?? 'phone',
  );
  const [content, setContent] = useState(() => followUp?.content ?? '');
  const [occurredAt, setOccurredAt] = useState(() => nowLocalInput());
  const [nextFollowUpAt, setNextFollowUpAt] = useState(
    () => followUp?.nextFollowUpAt ?? '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!selectedCustomer) return;
    const controller = new AbortController();
    api
      .opportunities({ customerId: selectedCustomer })
      .then((response) => {
        if (!controller.signal.aborted) setOpportunities(response.data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setOpportunities([]);
      });
    return () => controller.abort();
  }, [api, selectedCustomer]);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      await api.createFollowUp({
        customerId: selectedCustomer,
        opportunityId: opportunityId || null,
        channel,
        content: content.trim(),
        occurredAt: occurredAt ? new Date(occurredAt).toISOString() : undefined,
        nextFollowUpAt: nextFollowUpAt || null,
      });
      onSaved();
    } catch (cause: unknown) {
      setError(errorMessage(cause) || t('sales.common.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const chooseCustomer = !customerId && !followUp && customers !== undefined;

  return (
    <Dialog open onOpenChange={(value) => (value ? undefined : onClose())}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{t('sales.followups.create')}</DialogTitle>
        </DialogHeader>
        <form
          className='space-y-3'
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {chooseCustomer ? (
            <div className='space-y-1'>
              <Label htmlFor='followup-customer'>
                {t('sales.fields.customer')}
              </Label>
              <SelectInput
                id='followup-customer'
                required
                value={selectedCustomer}
                onChange={(event) => {
                  setSelectedCustomer(event.target.value);
                  setOpportunityId('');
                }}
              >
                <option value=''>{t('sales.followups.chooseCustomer')}</option>
                {(customers ?? []).map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </SelectInput>
            </div>
          ) : null}
          <div className='space-y-1'>
            <Label htmlFor='followup-opportunity'>
              {t('sales.fields.relatedOpportunity')}
            </Label>
            <SelectInput
              id='followup-opportunity'
              value={opportunityId}
              onChange={(event) => setOpportunityId(event.target.value)}
            >
              <option value=''>{t('sales.followups.noOpportunity')}</option>
              {opportunities.map((opportunity) => (
                <option key={opportunity.id} value={opportunity.id}>
                  {opportunity.name}
                </option>
              ))}
            </SelectInput>
          </div>
          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='space-y-1'>
              <Label htmlFor='followup-channel'>
                {t('sales.fields.channel')}
              </Label>
              <SelectInput
                id='followup-channel'
                value={channel}
                onChange={(event) => setChannel(event.target.value as Channel)}
              >
                {CHANNELS.map((item) => (
                  <option key={item} value={item}>
                    {t(`sales.channel.${item}`)}
                  </option>
                ))}
              </SelectInput>
            </div>
            <div className='space-y-1'>
              <Label htmlFor='followup-time'>
                {t('sales.fields.occurredAt')}
              </Label>
              <Input
                id='followup-time'
                type='datetime-local'
                value={occurredAt}
                onChange={(event) => setOccurredAt(event.target.value)}
              />
            </div>
          </div>
          <div className='space-y-1'>
            <Label htmlFor='followup-content'>
              {t('sales.fields.content')}
            </Label>
            <TextArea
              id='followup-content'
              required
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          </div>
          <div className='space-y-1'>
            <Label htmlFor='followup-next'>
              {t('sales.fields.nextFollowUp')}
            </Label>
            <Input
              id='followup-next'
              type='date'
              value={nextFollowUpAt}
              onChange={(event) => setNextFollowUpAt(event.target.value)}
            />
          </div>
          <ErrorNotice message={error} />
          <DialogFooter>
            <Button type='button' variant='outline' onClick={onClose}>
              {t('actions.cancel')}
            </Button>
            <Button
              type='submit'
              disabled={busy || !selectedCustomer || !content.trim()}
            >
              {busy ? t('sales.common.saving') : t('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
