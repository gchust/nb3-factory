import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeft, Pencil, Plus } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link, useParams } from 'react-router';

import { Loading } from '@/components/loading';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { CustomerAvatar } from '@/components/sales/customer-avatar';
import {
  ContactFormDialog,
  FollowUpFormDialog,
  OpportunityFormDialog,
} from '@/components/sales/forms';
import {
  Badge,
  DataTable,
  EmptyState,
  ErrorNotice,
  Field,
  Section,
  SelectInput,
  TextArea,
} from '@/components/sales/ui';
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
import {
  CUSTOMER_STATUSES,
  IMPORTANCE_LEVELS,
  errorMessage,
  formatAmount,
  formatDate,
  formatDateTime,
  useLoad,
  useSalesApi,
  type Contact,
  type CustomerDetail,
  type CustomerPayload,
} from '@/lib/sales';

export default function CustomerDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useSalesApi();
  const { id = '' } = useParams();
  const state = useLoad(id, () =>
    api.customer(id).then((response) => response.data),
  );

  return (
    <PageContainer>
      <Link
        to='/customers'
        className='inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground'
      >
        <ArrowLeft className='size-4' />
        {t('sales.customers.backToList')}
      </Link>
      {state.error ? <ErrorNotice message={state.error} /> : null}
      {state.loading && !state.data ? (
        <Loading label={t('status.loadingPage')} />
      ) : state.data ? (
        <CustomerDetailContent customer={state.data} onChanged={state.reload} />
      ) : null}
    </PageContainer>
  );
}

function CustomerDetailContent({
  customer,
  onChanged,
}: {
  readonly customer: CustomerDetail;
  readonly onChanged: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useSalesApi();
  const [editing, setEditing] = useState(false);
  const [addingContact, setAddingContact] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact>();
  const [addingOpportunity, setAddingOpportunity] = useState(false);
  const [addingFollowUp, setAddingFollowUp] = useState(false);
  const [error, setError] = useState<string>();

  const owners = useLoad('owners', () =>
    api.owners().then((response) => response.data),
  );
  const canAssignOwner = (owners.data?.length ?? 0) > 1;

  const removeContact = async (contact: Contact): Promise<void> => {
    setError(undefined);
    try {
      await api.deleteContact(contact.id);
      onChanged();
    } catch (cause: unknown) {
      setError(errorMessage(cause) || t('sales.common.saveFailed'));
    }
  };

  return (
    <div className='space-y-6'>
      <PageHeader
        title={customer.name}
        description={customer.industry ?? undefined}
        actions={
          <Button
            type='button'
            variant='outline'
            onClick={() => setEditing(true)}
          >
            <Pencil />
            {t('sales.customer.edit')}
          </Button>
        }
      />

      <div className='grid gap-6 lg:grid-cols-[1fr_2fr]'>
        <Section title={t('sales.customer.profile')}>
          <div className='space-y-4'>
            <CustomerAvatar customer={customer} onChanged={onChanged} />
            <div className='grid grid-cols-2 gap-3'>
              <Field label={t('sales.fields.importance')}>
                <Badge
                  tone={customer.importance === 'high' ? 'danger' : 'info'}
                >
                  {t(`sales.importance.${customer.importance}`)}
                </Badge>
              </Field>
              <Field label={t('sales.fields.status')}>
                <Badge
                  tone={customer.status === 'signed' ? 'success' : 'neutral'}
                >
                  {t(`sales.status.${customer.status}`)}
                </Badge>
              </Field>
              <Field label={t('sales.fields.owner')}>
                {customer.ownerName ?? '—'}
              </Field>
              <Field label={t('sales.fields.source')}>
                {customer.source ?? '—'}
              </Field>
              <Field label={t('sales.fields.phone')}>
                {customer.phone ?? '—'}
              </Field>
              <Field label={t('sales.fields.email')}>
                {customer.email ?? '—'}
              </Field>
              <Field
                label={t('sales.fields.nextFollowUp')}
                className='col-span-2'
              >
                {formatDate(customer.nextFollowUpAt)}
              </Field>
              <Field label={t('sales.fields.notes')} className='col-span-2'>
                <span className='whitespace-pre-wrap'>
                  {customer.notes ?? '—'}
                </span>
              </Field>
            </div>
          </div>
        </Section>

        <div className='space-y-6'>
          <Section
            title={t('sales.contacts.title')}
            actions={
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => setAddingContact(true)}
              >
                <Plus />
                {t('sales.contacts.create')}
              </Button>
            }
          >
            <ErrorNotice message={error} />
            {customer.contacts.length === 0 ? (
              <EmptyState>{t('sales.contacts.empty')}</EmptyState>
            ) : (
              <DataTable
                headers={[
                  t('sales.fields.contactName'),
                  t('sales.fields.title'),
                  t('sales.fields.phone'),
                  t('sales.fields.email'),
                  '',
                ]}
              >
                {customer.contacts.map((contact) => (
                  <tr
                    key={contact.id}
                    className='border-b border-border last:border-0'
                  >
                    <td className='px-3 py-2'>
                      {contact.name}
                      {contact.isPrimary ? (
                        <span className='ml-2'>
                          <Badge tone='info'>
                            {t('sales.contacts.primary')}
                          </Badge>
                        </span>
                      ) : null}
                    </td>
                    <td className='px-3 py-2 text-muted-foreground'>
                      {contact.title ?? '—'}
                    </td>
                    <td className='px-3 py-2 text-muted-foreground'>
                      {contact.phone ?? '—'}
                    </td>
                    <td className='px-3 py-2 text-muted-foreground'>
                      {contact.email ?? '—'}
                    </td>
                    <td className='px-3 py-2 text-right whitespace-nowrap'>
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        onClick={() => setEditingContact(contact)}
                      >
                        {t('sales.common.edit')}
                      </Button>
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        onClick={() => void removeContact(contact)}
                      >
                        {t('sales.common.delete')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Section>

          <Section
            title={t('sales.opportunities.title')}
            actions={
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => setAddingOpportunity(true)}
              >
                <Plus />
                {t('sales.opportunities.create')}
              </Button>
            }
          >
            {customer.opportunities.length === 0 ? (
              <EmptyState>{t('sales.opportunities.empty')}</EmptyState>
            ) : (
              <DataTable
                headers={[
                  t('sales.fields.opportunityName'),
                  t('sales.fields.amount'),
                  t('sales.fields.stage'),
                  t('sales.fields.expectedCloseDate'),
                ]}
              >
                {customer.opportunities.map((opportunity) => (
                  <tr
                    key={opportunity.id}
                    className='border-b border-border last:border-0'
                  >
                    <td className='px-3 py-2'>
                      <Link
                        to={`/opportunities/${opportunity.id}`}
                        className='font-medium text-primary hover:underline'
                      >
                        {opportunity.name}
                      </Link>
                    </td>
                    <td className='px-3 py-2'>
                      {formatAmount(opportunity.amount)}
                    </td>
                    <td className='px-3 py-2'>
                      <Badge tone={stageTone(opportunity.stage)}>
                        {t(`sales.stage.${opportunity.stage}`)}
                      </Badge>
                    </td>
                    <td className='px-3 py-2 text-muted-foreground'>
                      {formatDate(opportunity.expectedCloseDate)}
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Section>

          <Section
            title={t('sales.followups.title')}
            actions={
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => setAddingFollowUp(true)}
              >
                <Plus />
                {t('sales.followups.create')}
              </Button>
            }
          >
            {customer.followUps.length === 0 ? (
              <EmptyState>{t('sales.followups.empty')}</EmptyState>
            ) : (
              <ul className='divide-y divide-border rounded-lg border border-border'>
                {customer.followUps.map((followUp) => (
                  <li key={followUp.id} className='px-3 py-2'>
                    <div className='flex flex-wrap items-center justify-between gap-2'>
                      <Link
                        to={`/followups/${followUp.id}`}
                        className='text-sm font-medium text-primary hover:underline'
                      >
                        {formatDateTime(followUp.occurredAt)} ·{' '}
                        {t(`sales.channel.${followUp.channel}`)}
                      </Link>
                      <Badge tone={dueTone(followUp.dueState)}>
                        {t(`sales.due.${followUp.dueState}`)} ·{' '}
                        {formatDate(followUp.nextFollowUpAt)}
                      </Badge>
                    </div>
                    <p className='mt-1 text-sm text-muted-foreground'>
                      {followUp.content}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>

      {editing ? (
        <EditCustomerDialog
          customer={customer}
          owners={owners.data ?? []}
          canAssignOwner={canAssignOwner}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      ) : null}
      {addingContact ? (
        <ContactFormDialog
          customerId={customer.id}
          onClose={() => setAddingContact(false)}
          onSaved={() => {
            setAddingContact(false);
            onChanged();
          }}
        />
      ) : null}
      {editingContact ? (
        <ContactFormDialog
          key={editingContact.id}
          customerId={customer.id}
          contact={editingContact}
          onClose={() => setEditingContact(undefined)}
          onSaved={() => {
            setEditingContact(undefined);
            onChanged();
          }}
        />
      ) : null}
      {addingOpportunity ? (
        <OpportunityFormDialog
          customerId={customer.id}
          onClose={() => setAddingOpportunity(false)}
          onSaved={() => {
            setAddingOpportunity(false);
            onChanged();
          }}
        />
      ) : null}
      {addingFollowUp ? (
        <FollowUpFormDialog
          customerId={customer.id}
          onClose={() => setAddingFollowUp(false)}
          onSaved={() => {
            setAddingFollowUp(false);
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}

function EditCustomerDialog({
  customer,
  owners,
  canAssignOwner,
  onClose,
  onSaved,
}: {
  readonly customer: CustomerDetail;
  readonly owners: { id: string; name: string }[];
  readonly canAssignOwner: boolean;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useSalesApi();
  const [form, setForm] = useState<CustomerPayload>(() => ({
    name: customer.name,
    industry: customer.industry ?? '',
    source: customer.source ?? '',
    importance: customer.importance,
    status: customer.status,
    ownerId: customer.ownerId ?? '',
    phone: customer.phone ?? '',
    email: customer.email ?? '',
    notes: customer.notes ?? '',
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const set = <K extends keyof CustomerPayload>(
    key: K,
    value: CustomerPayload[K],
  ): void => setForm((current) => ({ ...current, [key]: value }));

  // Reassigning the customer moves its contacts, opportunities, follow-ups and
  // files to the new owner and revokes the previous owner's access, so the
  // dialog explains that before the change is saved.
  const ownerChanged =
    canAssignOwner && (form.ownerId ?? '') !== (customer.ownerId ?? '');

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      await api.updateCustomer(customer.id, {
        ...form,
        name: form.name.trim(),
        ownerId: form.ownerId || null,
      });
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
          <DialogTitle>{t('sales.customer.edit')}</DialogTitle>
        </DialogHeader>
        <form
          className='space-y-3'
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className='space-y-1'>
            <Label htmlFor='edit-customer-name'>{t('sales.fields.name')}</Label>
            <Input
              id='edit-customer-name'
              required
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
            />
          </div>
          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='space-y-1'>
              <Label htmlFor='edit-customer-industry'>
                {t('sales.fields.industry')}
              </Label>
              <Input
                id='edit-customer-industry'
                value={form.industry ?? ''}
                onChange={(event) => set('industry', event.target.value)}
              />
            </div>
            <div className='space-y-1'>
              <Label htmlFor='edit-customer-source'>
                {t('sales.fields.source')}
              </Label>
              <Input
                id='edit-customer-source'
                value={form.source ?? ''}
                onChange={(event) => set('source', event.target.value)}
              />
            </div>
            <div className='space-y-1'>
              <Label htmlFor='edit-customer-importance'>
                {t('sales.fields.importance')}
              </Label>
              <SelectInput
                id='edit-customer-importance'
                value={form.importance ?? 'normal'}
                onChange={(event) =>
                  set(
                    'importance',
                    event.target.value as CustomerPayload['importance'],
                  )
                }
              >
                {IMPORTANCE_LEVELS.map((item) => (
                  <option key={item} value={item}>
                    {t(`sales.importance.${item}`)}
                  </option>
                ))}
              </SelectInput>
            </div>
            <div className='space-y-1'>
              <Label htmlFor='edit-customer-status'>
                {t('sales.fields.status')}
              </Label>
              <SelectInput
                id='edit-customer-status'
                value={form.status ?? 'potential'}
                onChange={(event) =>
                  set('status', event.target.value as CustomerPayload['status'])
                }
              >
                {CUSTOMER_STATUSES.map((item) => (
                  <option key={item} value={item}>
                    {t(`sales.status.${item}`)}
                  </option>
                ))}
              </SelectInput>
            </div>
            {canAssignOwner ? (
              <div className='space-y-1 sm:col-span-2'>
                <Label htmlFor='edit-customer-owner'>
                  {t('sales.fields.owner')}
                </Label>
                <SelectInput
                  id='edit-customer-owner'
                  value={form.ownerId ?? ''}
                  onChange={(event) => set('ownerId', event.target.value)}
                >
                  <option value=''>{t('sales.customers.selfOwner')}</option>
                  {owners.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {owner.name}
                    </option>
                  ))}
                </SelectInput>
                {ownerChanged ? (
                  <p
                    role='status'
                    className='rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300'
                  >
                    {t('sales.customer.transferNotice')}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className='space-y-1'>
              <Label htmlFor='edit-customer-phone'>
                {t('sales.fields.phone')}
              </Label>
              <Input
                id='edit-customer-phone'
                value={form.phone ?? ''}
                onChange={(event) => set('phone', event.target.value)}
              />
            </div>
            <div className='space-y-1'>
              <Label htmlFor='edit-customer-email'>
                {t('sales.fields.email')}
              </Label>
              <Input
                id='edit-customer-email'
                type='email'
                value={form.email ?? ''}
                onChange={(event) => set('email', event.target.value)}
              />
            </div>
          </div>
          <div className='space-y-1'>
            <Label htmlFor='edit-customer-notes'>
              {t('sales.fields.notes')}
            </Label>
            <TextArea
              id='edit-customer-notes'
              value={form.notes ?? ''}
              onChange={(event) => set('notes', event.target.value)}
            />
          </div>
          <ErrorNotice message={error} />
          <DialogFooter>
            <Button type='button' variant='outline' onClick={onClose}>
              {t('actions.cancel')}
            </Button>
            <Button type='submit' disabled={busy || !form.name.trim()}>
              {busy ? t('sales.common.saving') : t('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function stageTone(stage: string): string {
  if (stage === 'won') return 'success';
  if (stage === 'lost') return 'danger';
  if (stage === 'negotiation' || stage === 'proposal') return 'info';
  return 'neutral';
}

function dueTone(due: string): string {
  if (due === 'overdue') return 'danger';
  if (due === 'today') return 'warning';
  if (due === 'upcoming') return 'info';
  return 'neutral';
}
