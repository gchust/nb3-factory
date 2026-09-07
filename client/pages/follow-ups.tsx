import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Pencil, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { EmptyState } from '../components/sales/empty-state';
import { ErrorState } from '../components/sales/error-state';
import { FormDialog } from '../components/sales/form-dialog';
import { FormField } from '../components/sales/form-field';
import { PageHeader } from '../components/sales/page-header';
import { useSalesApi } from '../components/sales/use-sales-api';
import { FOLLOW_UP_METHODS } from '../lib/sales-constants';
import {
  formatDateTime,
  isOverdue,
  toDateTimeInputValue,
} from '../lib/sales-format';
import type { Customer, FollowUp, Opportunity } from '../lib/sales-api';

interface FollowUpFormState {
  subject: string;
  method: string;
  followUpAt: string;
  nextFollowUpAt: string;
  content: string;
  customerId: string;
  opportunityId: string;
}

const EMPTY_FORM: FollowUpFormState = {
  subject: '',
  method: '',
  followUpAt: '',
  nextFollowUpAt: '',
  content: '',
  customerId: '',
  opportunityId: '',
};

export default function FollowUpsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useSalesApi();
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [editFollowUp, setEditFollowUp] = useState<FollowUp | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const [followUpRows, customerRows, opportunityRows] = await Promise.all([
        api.listFollowUps({ q: q || undefined }),
        api.listCustomers(),
        api.listOpportunities(),
      ]);
      setFollowUps(followUpRows);
      setCustomers(customerRows);
      setOpportunities(opportunityRows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [api, q]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  const customerName = (id: number | null): string =>
    id === null
      ? '—'
      : (customers.find((customer) => customer.id === id)?.name ?? String(id));

  const opportunityName = (id: number | null): string =>
    id === null
      ? '—'
      : (opportunities.find((opportunity) => opportunity.id === id)?.name ??
        String(id));

  return (
    <div className='space-y-6'>
      <PageHeader
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            {t('sales.followUps.create', { defaultValue: 'New follow-up' })}
          </Button>
        }
        description={t('sales.followUps.description', {
          defaultValue: 'Plan and record customer follow-ups',
        })}
        title={t('sales.followUps.title', { defaultValue: 'Follow-ups' })}
      />

      <Input
        className='sm:max-w-xs'
        onChange={(event) => setQ(event.target.value)}
        placeholder={t('sales.followUps.search', {
          defaultValue: 'Search follow-ups…',
        })}
        value={q}
      />

      {error ? <ErrorState message={error} /> : null}

      {loading ? (
        <p className='text-sm text-muted-foreground'>
          {t('sales.loading', { defaultValue: 'Loading…' })}
        </p>
      ) : followUps.length === 0 ? (
        <EmptyState
          message={t('sales.followUps.empty', {
            defaultValue: 'No follow-ups yet.',
          })}
        />
      ) : (
        <div className='overflow-x-auto rounded-xl border border-border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {t('sales.followUps.subject', { defaultValue: 'Subject' })}
                </TableHead>
                <TableHead>
                  {t('sales.followUps.method', { defaultValue: 'Method' })}
                </TableHead>
                <TableHead>
                  {t('sales.followUps.customer', { defaultValue: 'Customer' })}
                </TableHead>
                <TableHead>
                  {t('sales.followUps.opportunity', {
                    defaultValue: 'Opportunity',
                  })}
                </TableHead>
                <TableHead>
                  {t('sales.followUps.followUpAt', {
                    defaultValue: 'Follow-up at',
                  })}
                </TableHead>
                <TableHead>
                  {t('sales.followUps.nextFollowUpAt', {
                    defaultValue: 'Next at',
                  })}
                </TableHead>
                <TableHead className='text-right'>
                  {t('sales.actions.label', { defaultValue: 'Actions' })}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {followUps.map((followUp) => {
                const overdue = isOverdue(followUp.nextFollowUpAt);
                return (
                  <TableRow
                    className={overdue ? 'bg-destructive/5' : undefined}
                    key={followUp.id}
                  >
                    <TableCell className='font-medium'>
                      {followUp.subject}
                      {overdue ? (
                        <span className='ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive'>
                          {t('sales.followUps.overdue', {
                            defaultValue: 'overdue',
                          })}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {followUp.method
                        ? t(`sales.methods.${followUp.method}`, {
                            defaultValue: followUp.method,
                          })
                        : '—'}
                    </TableCell>
                    <TableCell>{customerName(followUp.customerId)}</TableCell>
                    <TableCell>
                      {opportunityName(followUp.opportunityId)}
                    </TableCell>
                    <TableCell>{formatDateTime(followUp.followUpAt)}</TableCell>
                    <TableCell>
                      {formatDateTime(followUp.nextFollowUpAt)}
                    </TableCell>
                    <TableCell>
                      <div className='flex justify-end gap-1'>
                        <Button
                          onClick={() => setEditFollowUp(followUp)}
                          size='icon-sm'
                          title={t('sales.actions.edit', {
                            defaultValue: 'Edit',
                          })}
                          variant='ghost'
                        >
                          <Pencil />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <FollowUpFormDialog
        customers={customers}
        initial={null}
        onOpenChange={setCreateOpen}
        onSaved={() => void load()}
        open={createOpen}
        opportunities={opportunities}
      />
      <FollowUpFormDialog
        customers={customers}
        initial={editFollowUp}
        onOpenChange={(open) => {
          if (!open) setEditFollowUp(null);
        }}
        onSaved={() => void load()}
        open={editFollowUp !== null}
        opportunities={opportunities}
      />
    </div>
  );
}

function FollowUpFormDialog({
  open,
  initial,
  customers,
  opportunities,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  initial: FollowUp | null;
  customers: Customer[];
  opportunities: Opportunity[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useSalesApi();
  const [form, setForm] = useState<FollowUpFormState>(EMPTY_FORM);
  const [lastOpen, setLastOpen] = useState(open);

  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setForm(
        initial
          ? {
              subject: initial.subject,
              method: initial.method ?? '',
              followUpAt: toDateTimeInputValue(initial.followUpAt),
              nextFollowUpAt: initial.nextFollowUpAt
                ? toDateTimeInputValue(initial.nextFollowUpAt)
                : '',
              content: initial.content ?? '',
              customerId: initial.customerId ? String(initial.customerId) : '',
              opportunityId: initial.opportunityId
                ? String(initial.opportunityId)
                : '',
            }
          : EMPTY_FORM,
      );
    }
  }

  const set = (key: keyof FollowUpFormState) => (value: string | null) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const handleSubmit = async (): Promise<void> => {
    if (!form.subject.trim()) {
      throw new Error(
        t('sales.followUps.subjectRequired', {
          defaultValue: 'Subject is required.',
        }),
      );
    }
    if (!form.followUpAt) {
      throw new Error(
        t('sales.followUps.timeRequired', {
          defaultValue: 'Follow-up time is required.',
        }),
      );
    }
    const input: Record<string, unknown> = {
      subject: form.subject.trim(),
      method: form.method || null,
      followUpAt: new Date(form.followUpAt).toISOString(),
      nextFollowUpAt: form.nextFollowUpAt
        ? new Date(form.nextFollowUpAt).toISOString()
        : null,
      content: form.content || null,
      customerId: form.customerId ? Number(form.customerId) : null,
      opportunityId: form.opportunityId ? Number(form.opportunityId) : null,
    };
    if (initial) {
      await api.updateFollowUp(initial.id, input);
    } else {
      await api.createFollowUp(input);
    }
    onSaved();
  };

  return (
    <FormDialog
      description={
        initial
          ? t('sales.followUps.editDescription', {
              defaultValue: 'Update the follow-up.',
            })
          : t('sales.followUps.createDescription', {
              defaultValue: 'Plan a follow-up with a customer.',
            })
      }
      onOpenChange={onOpenChange}
      onSubmit={handleSubmit}
      open={open}
      title={
        initial
          ? t('sales.followUps.edit', { defaultValue: 'Edit follow-up' })
          : t('sales.followUps.create', { defaultValue: 'New follow-up' })
      }
    >
      <FormField
        label={t('sales.followUps.subject', { defaultValue: 'Subject' })}
        required
      >
        <Input
          onChange={(event) => set('subject')(event.target.value)}
          value={form.subject}
        />
      </FormField>
      <div className='grid gap-4 sm:grid-cols-2'>
        <FormField
          label={t('sales.followUps.method', { defaultValue: 'Method' })}
        >
          <Select value={form.method} onValueChange={set('method')}>
            <SelectTrigger className='w-full'>
              <SelectValue
                placeholder={t('sales.followUps.selectMethod', {
                  defaultValue: 'Select method',
                })}
              />
            </SelectTrigger>
            <SelectContent>
              {FOLLOW_UP_METHODS.map((method) => (
                <SelectItem key={method} value={method}>
                  {t(`sales.methods.${method}`, { defaultValue: method })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField
          label={t('sales.followUps.customer', { defaultValue: 'Customer' })}
        >
          <Select value={form.customerId} onValueChange={set('customerId')}>
            <SelectTrigger className='w-full'>
              <SelectValue
                placeholder={t('sales.followUps.selectCustomer', {
                  defaultValue: 'Select customer',
                })}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value=''>
                {t('sales.followUps.none', { defaultValue: 'None' })}
              </SelectItem>
              {customers.map((customer) => (
                <SelectItem key={customer.id} value={String(customer.id)}>
                  {customer.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>
      <div className='grid gap-4 sm:grid-cols-2'>
        <FormField
          label={t('sales.followUps.opportunity', {
            defaultValue: 'Opportunity',
          })}
        >
          <Select
            value={form.opportunityId}
            onValueChange={set('opportunityId')}
          >
            <SelectTrigger className='w-full'>
              <SelectValue
                placeholder={t('sales.followUps.selectOpportunity', {
                  defaultValue: 'Select opportunity',
                })}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value=''>
                {t('sales.followUps.none', { defaultValue: 'None' })}
              </SelectItem>
              {opportunities.map((opportunity) => (
                <SelectItem key={opportunity.id} value={String(opportunity.id)}>
                  {opportunity.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField
          label={t('sales.followUps.followUpAt', {
            defaultValue: 'Follow-up at',
          })}
          required
        >
          <Input
            onChange={(event) => set('followUpAt')(event.target.value)}
            type='datetime-local'
            value={form.followUpAt}
          />
        </FormField>
      </div>
      <FormField
        label={t('sales.followUps.nextFollowUpAt', {
          defaultValue: 'Next follow-up at',
        })}
      >
        <Input
          onChange={(event) => set('nextFollowUpAt')(event.target.value)}
          type='datetime-local'
          value={form.nextFollowUpAt}
        />
      </FormField>
      <FormField
        label={t('sales.followUps.content', { defaultValue: 'Content' })}
      >
        <textarea
          className='min-h-20 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
          onChange={(event) => set('content')(event.target.value)}
          value={form.content}
        />
      </FormField>
    </FormDialog>
  );
}
