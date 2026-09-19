import { useTranslation } from '@nocobase/i18n/client';
import { Search } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import {
  Badge,
  DataTable,
  EmptyState,
  ErrorNotice,
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
import { Loading } from '@/components/loading';
import {
  CUSTOMER_STATUSES,
  IMPORTANCE_LEVELS,
  errorMessage,
  formatAmount,
  formatDate,
  useLoad,
  useSalesApi,
  type CustomerPayload,
  type CustomerSummary,
} from '@/lib/sales';

export default function CustomersPage(): ReactElement {
  const { t } = useTranslation();
  const api = useSalesApi();
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [query, setQuery] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);

  const owners = useLoad('owners', () =>
    api.owners().then((response) => response.data),
  );
  const canAssignOwner = (owners.data?.length ?? 0) > 1;

  const customers = useLoad(JSON.stringify(query), () =>
    api.customers(query).then((response) => response.data),
  );

  const apply = (): void => {
    const next: Record<string, string> = {};
    if (term.trim()) next.q = term.trim();
    if (status) next.status = status;
    if (ownerId) next.ownerId = ownerId;
    setQuery(next);
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('sales.customers.title')}
        description={t('sales.customers.description')}
        actions={
          <Button type='button' onClick={() => setCreating(true)}>
            {t('sales.customers.create')}
          </Button>
        }
      />

      <form
        className='flex flex-wrap items-end gap-2'
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <div className='relative min-w-56 flex-1'>
          <Search className='pointer-events-none absolute top-2 left-2 size-4 text-muted-foreground' />
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={t('sales.customers.searchPlaceholder')}
            className='pl-8'
            aria-label={t('sales.customers.search')}
          />
        </div>
        <SelectInput
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label={t('sales.fields.status')}
          className='w-40'
        >
          <option value=''>{t('sales.customers.allStatus')}</option>
          {CUSTOMER_STATUSES.map((item) => (
            <option key={item} value={item}>
              {t(`sales.status.${item}`)}
            </option>
          ))}
        </SelectInput>
        {canAssignOwner ? (
          <SelectInput
            value={ownerId}
            onChange={(event) => setOwnerId(event.target.value)}
            aria-label={t('sales.fields.owner')}
            className='w-44'
          >
            <option value=''>{t('sales.customers.allOwners')}</option>
            {(owners.data ?? []).map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name}
              </option>
            ))}
          </SelectInput>
        ) : null}
        <Button type='submit' variant='outline'>
          {t('sales.customers.applyFilters')}
        </Button>
      </form>

      {customers.error ? <ErrorNotice message={customers.error} /> : null}
      {customers.loading && !customers.data ? (
        <Loading label={t('status.loadingPage')} />
      ) : customers.data ? (
        customers.data.length === 0 ? (
          <EmptyState>{t('sales.customers.empty')}</EmptyState>
        ) : (
          <DataTable
            headers={[
              t('sales.fields.name'),
              t('sales.fields.industry'),
              t('sales.fields.importance'),
              t('sales.fields.status'),
              t('sales.fields.owner'),
              t('sales.fields.nextFollowUp'),
              t('sales.customers.opportunitySummary'),
              '',
            ]}
          >
            {customers.data.map((customer) => (
              <tr
                key={customer.id}
                className='border-b border-border last:border-0'
              >
                <td className='px-3 py-2'>
                  <Link
                    to={`/customers/${customer.id}`}
                    className='font-medium text-primary hover:underline'
                  >
                    {customer.name}
                  </Link>
                </td>
                <td className='px-3 py-2 text-muted-foreground'>
                  {customer.industry ?? '—'}
                </td>
                <td className='px-3 py-2'>
                  <Badge tone={importanceTone(customer.importance)}>
                    {t(`sales.importance.${customer.importance}`)}
                  </Badge>
                </td>
                <td className='px-3 py-2'>
                  <Badge tone={statusTone(customer.status)}>
                    {t(`sales.status.${customer.status}`)}
                  </Badge>
                </td>
                <td className='px-3 py-2'>{customer.ownerName ?? '—'}</td>
                <td className='px-3 py-2 text-muted-foreground'>
                  {formatDate(customer.nextFollowUpAt)}
                </td>
                <td className='px-3 py-2 text-muted-foreground'>
                  {t('sales.customers.opportunityCount', {
                    count: customer.opportunityCount,
                  })}{' '}
                  · {formatAmount(customer.openOpportunityAmount)}
                </td>
                <td className='px-3 py-2 text-right'>
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    onClick={() => {
                      void navigate(`/customers/${customer.id}`);
                    }}
                  >
                    {t('sales.customers.view')}
                  </Button>
                </td>
              </tr>
            ))}
          </DataTable>
        )
      ) : null}

      {creating ? (
        <CreateCustomerDialog
          owners={owners.data ?? []}
          canAssignOwner={canAssignOwner}
          onClose={() => setCreating(false)}
          onCreated={(customer) => {
            setCreating(false);
            void navigate(`/customers/${customer.id}`);
          }}
        />
      ) : null}
    </PageContainer>
  );
}

export function CreateCustomerDialog({
  owners,
  canAssignOwner,
  onClose,
  onCreated,
}: {
  readonly owners: { id: string; name: string }[];
  readonly canAssignOwner: boolean;
  readonly onClose: () => void;
  readonly onCreated: (customer: CustomerSummary) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useSalesApi();
  const [form, setForm] = useState<CustomerPayload>({ name: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const set = <K extends keyof CustomerPayload>(
    key: K,
    value: CustomerPayload[K],
  ): void => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      const response = await api.createCustomer({
        ...form,
        name: form.name.trim(),
      });
      onCreated(response.data);
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
          <DialogTitle>{t('sales.customers.create')}</DialogTitle>
        </DialogHeader>
        <form
          className='space-y-3'
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className='space-y-1'>
            <Label htmlFor='customer-name'>{t('sales.fields.name')}</Label>
            <Input
              id='customer-name'
              required
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
            />
          </div>
          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='space-y-1'>
              <Label htmlFor='customer-industry'>
                {t('sales.fields.industry')}
              </Label>
              <Input
                id='customer-industry'
                value={form.industry ?? ''}
                onChange={(event) => set('industry', event.target.value)}
              />
            </div>
            <div className='space-y-1'>
              <Label htmlFor='customer-source'>
                {t('sales.fields.source')}
              </Label>
              <Input
                id='customer-source'
                value={form.source ?? ''}
                onChange={(event) => set('source', event.target.value)}
              />
            </div>
            <div className='space-y-1'>
              <Label htmlFor='customer-importance'>
                {t('sales.fields.importance')}
              </Label>
              <SelectInput
                id='customer-importance'
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
              <Label htmlFor='customer-status'>
                {t('sales.fields.status')}
              </Label>
              <SelectInput
                id='customer-status'
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
                <Label htmlFor='customer-owner'>
                  {t('sales.fields.owner')}
                </Label>
                <SelectInput
                  id='customer-owner'
                  value={form.ownerId ?? ''}
                  onChange={(event) =>
                    set('ownerId', event.target.value || null)
                  }
                >
                  <option value=''>{t('sales.customers.selfOwner')}</option>
                  {owners.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {owner.name}
                    </option>
                  ))}
                </SelectInput>
              </div>
            ) : null}
            <div className='space-y-1'>
              <Label htmlFor='customer-phone'>{t('sales.fields.phone')}</Label>
              <Input
                id='customer-phone'
                value={form.phone ?? ''}
                onChange={(event) => set('phone', event.target.value)}
              />
            </div>
            <div className='space-y-1'>
              <Label htmlFor='customer-email'>{t('sales.fields.email')}</Label>
              <Input
                id='customer-email'
                type='email'
                value={form.email ?? ''}
                onChange={(event) => set('email', event.target.value)}
              />
            </div>
          </div>
          <div className='space-y-1'>
            <Label htmlFor='customer-notes'>{t('sales.fields.notes')}</Label>
            <TextArea
              id='customer-notes'
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

function importanceTone(importance: string): string {
  if (importance === 'high') return 'danger';
  if (importance === 'low') return 'neutral';
  return 'info';
}

function statusTone(status: string): string {
  if (status === 'signed') return 'success';
  if (status === 'lost') return 'danger';
  if (status === 'following') return 'info';
  return 'neutral';
}
