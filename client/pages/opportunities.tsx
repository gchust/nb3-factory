import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  Archive,
  ArrowRight,
  Pencil,
  Plus,
  Trophy,
  XCircle,
} from 'lucide-react';

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

import { ConfirmDialog } from '../components/sales/confirm-dialog';
import { EmptyState } from '../components/sales/empty-state';
import { ErrorState } from '../components/sales/error-state';
import { FormDialog } from '../components/sales/form-dialog';
import { FormField } from '../components/sales/form-field';
import { PageHeader } from '../components/sales/page-header';
import { StageBadge, StatusBadge } from '../components/sales/status-badge';
import { useSalesApi } from '../components/sales/use-sales-api';
import {
  ACTIVE_STAGES,
  OPPORTUNITY_STAGES,
  STAGE_ORDER,
} from '../lib/sales-constants';
import {
  formatDate,
  formatMoney,
  formatPercent,
  toDateInputValue,
} from '../lib/sales-format';
import type { Contact, Customer, Opportunity } from '../lib/sales-api';

interface OpportunityFormState {
  name: string;
  customerId: string;
  expectedAmount: string;
  expectedCloseDate: string;
  contactIds: string[];
}

const EMPTY_FORM: OpportunityFormState = {
  name: '',
  customerId: '',
  expectedAmount: '',
  expectedCloseDate: '',
  contactIds: [],
};

export default function OpportunitiesPage(): ReactElement {
  const { t } = useTranslation();
  const api = useSalesApi();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpportunity, setEditOpportunity] = useState<Opportunity | null>(
    null,
  );
  const [winOpportunity, setWinOpportunity] = useState<Opportunity | null>(
    null,
  );
  const [loseOpportunity, setLoseOpportunity] = useState<Opportunity | null>(
    null,
  );
  const [archiveOpportunity, setArchiveOpportunity] =
    useState<Opportunity | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const [opportunityRows, customerRows, contactRows] = await Promise.all([
        api.listOpportunities({ q: q || undefined, stage: stage || undefined }),
        api.listCustomers(),
        api.listContacts(),
      ]);
      setOpportunities(opportunityRows);
      setCustomers(customerRows);
      setContacts(contactRows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [api, q, stage]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  const customerName = (id: number): string =>
    customers.find((customer) => customer.id === id)?.name ?? String(id);

  const nextStage = (current: string): string | null => {
    const order = STAGE_ORDER[current];
    if (order === undefined) return null;
    const next = OPPORTUNITY_STAGES[order + 1];
    return next ?? null;
  };

  return (
    <div className='space-y-6'>
      <PageHeader
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            {t('sales.opportunities.create', {
              defaultValue: 'New opportunity',
            })}
          </Button>
        }
        description={t('sales.opportunities.description', {
          defaultValue: 'Track deals through the sales pipeline',
        })}
        title={t('sales.opportunities.title', {
          defaultValue: 'Opportunities',
        })}
      />

      <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
        <Input
          className='sm:max-w-xs'
          onChange={(event) => setQ(event.target.value)}
          placeholder={t('sales.opportunities.search', {
            defaultValue: 'Search opportunities…',
          })}
          value={q}
        />
        <Select value={stage} onValueChange={(value) => setStage(value ?? '')}>
          <SelectTrigger className='sm:w-48'>
            <SelectValue
              placeholder={t('sales.opportunities.allStages', {
                defaultValue: 'All stages',
              })}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value=''>
              {t('sales.opportunities.allStages', {
                defaultValue: 'All stages',
              })}
            </SelectItem>
            {OPPORTUNITY_STAGES.map((item) => (
              <SelectItem key={item} value={item}>
                {t(`sales.stages.${item}`, { defaultValue: item })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error ? <ErrorState message={error} /> : null}

      {loading ? (
        <p className='text-sm text-muted-foreground'>
          {t('sales.loading', { defaultValue: 'Loading…' })}
        </p>
      ) : opportunities.length === 0 ? (
        <EmptyState
          message={t('sales.opportunities.empty', {
            defaultValue: 'No opportunities yet.',
          })}
        />
      ) : (
        <div className='overflow-x-auto rounded-xl border border-border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {t('sales.opportunities.name', { defaultValue: 'Name' })}
                </TableHead>
                <TableHead>
                  {t('sales.opportunities.customer', {
                    defaultValue: 'Customer',
                  })}
                </TableHead>
                <TableHead>
                  {t('sales.opportunities.stage', { defaultValue: 'Stage' })}
                </TableHead>
                <TableHead className='text-right'>
                  {t('sales.opportunities.expectedAmount', {
                    defaultValue: 'Expected',
                  })}
                </TableHead>
                <TableHead className='text-right'>
                  {t('sales.opportunities.probability', {
                    defaultValue: 'Probability',
                  })}
                </TableHead>
                <TableHead className='text-right'>
                  {t('sales.opportunities.weightedAmount', {
                    defaultValue: 'Weighted',
                  })}
                </TableHead>
                <TableHead>
                  {t('sales.opportunities.closeDate', {
                    defaultValue: 'Close date',
                  })}
                </TableHead>
                <TableHead>
                  {t('sales.opportunities.approval', {
                    defaultValue: 'Approval',
                  })}
                </TableHead>
                <TableHead className='text-right'>
                  {t('sales.actions.label', { defaultValue: 'Actions' })}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {opportunities.map((opportunity) => {
                const next = nextStage(opportunity.stage);
                return (
                  <TableRow key={opportunity.id}>
                    <TableCell className='font-medium'>
                      {opportunity.name}
                      {opportunity.isArchived ? (
                        <span className='ml-2 text-xs text-muted-foreground'>
                          {t('sales.opportunities.archived', {
                            defaultValue: 'archived',
                          })}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {customerName(opportunity.customerId)}
                    </TableCell>
                    <TableCell>
                      <StageBadge stage={opportunity.stage} />
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {formatMoney(opportunity.expectedAmount)}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {formatPercent(opportunity.winProbability)}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {formatMoney(opportunity.weightedAmount)}
                    </TableCell>
                    <TableCell>
                      {formatDate(opportunity.expectedCloseDate)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        prefix='approval'
                        status={opportunity.approvalStatus}
                      />
                    </TableCell>
                    <TableCell>
                      <div className='flex justify-end gap-1'>
                        {next && !opportunity.isArchived ? (
                          <Button
                            onClick={() => void advance(api, opportunity, load)}
                            size='icon-sm'
                            title={t('sales.opportunities.advance', {
                              defaultValue: 'Advance to next stage',
                            })}
                            variant='ghost'
                          >
                            <ArrowRight />
                          </Button>
                        ) : null}
                        {ACTIVE_STAGES.includes(
                          opportunity.stage as (typeof ACTIVE_STAGES)[number],
                        ) && !opportunity.isArchived ? (
                          <>
                            <Button
                              onClick={() => setWinOpportunity(opportunity)}
                              size='icon-sm'
                              title={t('sales.opportunities.win', {
                                defaultValue: 'Mark won',
                              })}
                              variant='ghost'
                            >
                              <Trophy />
                            </Button>
                            <Button
                              onClick={() => setLoseOpportunity(opportunity)}
                              size='icon-sm'
                              title={t('sales.opportunities.lose', {
                                defaultValue: 'Mark lost',
                              })}
                              variant='ghost'
                            >
                              <XCircle />
                            </Button>
                          </>
                        ) : null}
                        {!opportunity.isArchived ? (
                          <Button
                            onClick={() => setEditOpportunity(opportunity)}
                            size='icon-sm'
                            title={t('sales.actions.edit', {
                              defaultValue: 'Edit',
                            })}
                            variant='ghost'
                          >
                            <Pencil />
                          </Button>
                        ) : null}
                        {!opportunity.isArchived &&
                        (opportunity.stage === 'won' ||
                          opportunity.stage === 'lost') ? (
                          <Button
                            onClick={() => setArchiveOpportunity(opportunity)}
                            size='icon-sm'
                            title={t('sales.opportunities.archive', {
                              defaultValue: 'Archive',
                            })}
                            variant='ghost'
                          >
                            <Archive />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <OpportunityFormDialog
        contacts={contacts}
        customers={customers}
        initial={null}
        onOpenChange={setCreateOpen}
        onSaved={() => void load()}
        open={createOpen}
      />
      <OpportunityFormDialog
        contacts={contacts}
        customers={customers}
        initial={editOpportunity}
        onOpenChange={(open) => {
          if (!open) setEditOpportunity(null);
        }}
        onSaved={() => void load()}
        open={editOpportunity !== null}
      />
      <WinDialog
        opportunity={winOpportunity}
        onClose={() => setWinOpportunity(null)}
        onSaved={() => void load()}
      />
      <LoseDialog
        opportunity={loseOpportunity}
        onClose={() => setLoseOpportunity(null)}
        onSaved={() => void load()}
      />
      <ConfirmDialog
        description={t('sales.opportunities.archiveConfirm', {
          defaultValue:
            'The opportunity will be archived and hidden from the pipeline.',
        })}
        onConfirm={async () => {
          if (!archiveOpportunity) return;
          await api.archiveOpportunity(archiveOpportunity.id);
          await load();
        }}
        onOpenChange={(open) => {
          if (!open) setArchiveOpportunity(null);
        }}
        open={archiveOpportunity !== null}
        title={t('sales.opportunities.archive', { defaultValue: 'Archive' })}
      />
    </div>
  );
}

async function advance(
  api: ReturnType<typeof useSalesApi>,
  opportunity: Opportunity,
  load: () => Promise<void>,
): Promise<void> {
  await api.advanceOpportunity(opportunity.id);
  await load();
}

function OpportunityFormDialog({
  open,
  initial,
  customers,
  contacts,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  initial: Opportunity | null;
  customers: Customer[];
  contacts: Contact[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useSalesApi();
  const [form, setForm] = useState<OpportunityFormState>(EMPTY_FORM);
  const [lastOpen, setLastOpen] = useState(open);

  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setForm(
        initial
          ? {
              name: initial.name,
              customerId: String(initial.customerId),
              expectedAmount: String(initial.expectedAmount ?? ''),
              expectedCloseDate: initial.expectedCloseDate
                ? toDateInputValue(initial.expectedCloseDate)
                : '',
              contactIds: (initial.contacts ?? []).map((contact) =>
                String(contact.id),
              ),
            }
          : EMPTY_FORM,
      );
    }
  }

  const set =
    (key: keyof OpportunityFormState) => (value: string | string[] | null) =>
      setForm((previous) => ({ ...previous, [key]: value }));

  const customerContacts = contacts.filter(
    (contact) => contact.customerId === Number(form.customerId),
  );

  const toggleContact = (id: string): void => {
    setForm((previous) => ({
      ...previous,
      contactIds: previous.contactIds.includes(id)
        ? previous.contactIds.filter((item) => item !== id)
        : [...previous.contactIds, id],
    }));
  };

  const handleSubmit = async (): Promise<void> => {
    if (!form.name.trim()) {
      throw new Error(
        t('sales.opportunities.nameRequired', {
          defaultValue: 'Name is required.',
        }),
      );
    }
    if (!form.customerId) {
      throw new Error(
        t('sales.opportunities.customerRequired', {
          defaultValue: 'Customer is required.',
        }),
      );
    }
    const input: Record<string, unknown> = {
      name: form.name.trim(),
      customerId: Number(form.customerId),
      expectedAmount: form.expectedAmount ? Number(form.expectedAmount) : 0,
      expectedCloseDate: form.expectedCloseDate || null,
      contactIds: form.contactIds.map(Number),
    };
    if (initial) {
      await api.updateOpportunity(initial.id, input);
    } else {
      await api.createOpportunity(input);
    }
    onSaved();
  };

  return (
    <FormDialog
      description={
        initial
          ? t('sales.opportunities.editDescription', {
              defaultValue: 'Update the opportunity details.',
            })
          : t('sales.opportunities.createDescription', {
              defaultValue: 'Open a new deal in the pipeline.',
            })
      }
      onOpenChange={onOpenChange}
      onSubmit={handleSubmit}
      open={open}
      title={
        initial
          ? t('sales.opportunities.edit', { defaultValue: 'Edit opportunity' })
          : t('sales.opportunities.create', { defaultValue: 'New opportunity' })
      }
    >
      <FormField
        label={t('sales.opportunities.name', { defaultValue: 'Name' })}
        required
      >
        <Input
          onChange={(event) => set('name')(event.target.value)}
          value={form.name}
        />
      </FormField>
      <FormField
        label={t('sales.opportunities.customer', { defaultValue: 'Customer' })}
        required
      >
        <Select value={form.customerId} onValueChange={set('customerId')}>
          <SelectTrigger className='w-full'>
            <SelectValue
              placeholder={t('sales.opportunities.selectCustomer', {
                defaultValue: 'Select customer',
              })}
            />
          </SelectTrigger>
          <SelectContent>
            {customers.map((customer) => (
              <SelectItem key={customer.id} value={String(customer.id)}>
                {customer.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <div className='grid gap-4 sm:grid-cols-2'>
        <FormField
          label={t('sales.opportunities.expectedAmount', {
            defaultValue: 'Expected amount',
          })}
        >
          <Input
            min='0'
            onChange={(event) => set('expectedAmount')(event.target.value)}
            step='0.01'
            type='number'
            value={form.expectedAmount}
          />
        </FormField>
        <FormField
          label={t('sales.opportunities.closeDate', {
            defaultValue: 'Expected close date',
          })}
        >
          <Input
            onChange={(event) => set('expectedCloseDate')(event.target.value)}
            type='date'
            value={form.expectedCloseDate}
          />
        </FormField>
      </div>
      {form.customerId ? (
        <FormField
          label={t('sales.opportunities.contacts', {
            defaultValue: 'Contacts',
          })}
        >
          {customerContacts.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('sales.opportunities.noContacts', {
                defaultValue: 'No contacts for this customer yet.',
              })}
            </p>
          ) : (
            <div className='grid gap-1.5 sm:grid-cols-2'>
              {customerContacts.map((contact) => (
                <label
                  className='flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm'
                  key={contact.id}
                >
                  <input
                    checked={form.contactIds.includes(String(contact.id))}
                    className='size-4 rounded border-border accent-primary'
                    onChange={() => toggleContact(String(contact.id))}
                    type='checkbox'
                  />
                  <span className='truncate'>
                    {contact.name}
                    {contact.position ? ` · ${contact.position}` : ''}
                  </span>
                </label>
              ))}
            </div>
          )}
        </FormField>
      ) : null}
      {initial ? (
        <p className='text-sm text-muted-foreground'>
          {t('sales.opportunities.stageHint', {
            defaultValue: 'Stage:',
          })}{' '}
          <StageBadge stage={initial.stage} />
        </p>
      ) : null}
    </FormDialog>
  );
}

function WinDialog({
  opportunity,
  onClose,
  onSaved,
}: {
  opportunity: Opportunity | null;
  onClose: () => void;
  onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useSalesApi();
  const [actualAmount, setActualAmount] = useState('');
  const [resultReason, setResultReason] = useState('');
  const [lastOpportunity, setLastOpportunity] = useState(opportunity);

  if (opportunity !== lastOpportunity) {
    setLastOpportunity(opportunity);
    if (opportunity) {
      setActualAmount(
        opportunity.expectedAmount ? String(opportunity.expectedAmount) : '',
      );
      setResultReason('');
    }
  }

  return (
    <FormDialog
      description={t('sales.opportunities.winDescription', {
        defaultValue:
          'Record the deal as won. The actual amount must be greater than zero.',
      })}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onSubmit={async () => {
        if (!opportunity) return;
        const amount = Number(actualAmount);
        if (!Number.isFinite(amount) || amount <= 0) {
          throw new Error(
            t('sales.opportunities.amountRequired', {
              defaultValue: 'A positive actual amount is required.',
            }),
          );
        }
        await api.winOpportunity(
          opportunity.id,
          amount,
          resultReason || undefined,
        );
        onSaved();
      }}
      open={opportunity !== null}
      submitLabel={t('sales.opportunities.win', { defaultValue: 'Mark won' })}
      title={t('sales.opportunities.win', { defaultValue: 'Mark won' })}
    >
      <FormField
        label={t('sales.opportunities.actualAmount', {
          defaultValue: 'Actual amount',
        })}
        required
      >
        <Input
          min='0'
          onChange={(event) => setActualAmount(event.target.value)}
          step='0.01'
          type='number'
          value={actualAmount}
        />
      </FormField>
      <FormField
        label={t('sales.opportunities.resultReason', {
          defaultValue: 'Result reason',
        })}
      >
        <textarea
          className='min-h-20 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
          onChange={(event) => setResultReason(event.target.value)}
          value={resultReason}
        />
      </FormField>
    </FormDialog>
  );
}

function LoseDialog({
  opportunity,
  onClose,
  onSaved,
}: {
  opportunity: Opportunity | null;
  onClose: () => void;
  onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useSalesApi();
  const [resultReason, setResultReason] = useState('');
  const [lastOpportunity, setLastOpportunity] = useState(opportunity);

  if (opportunity !== lastOpportunity) {
    setLastOpportunity(opportunity);
    if (opportunity) setResultReason('');
  }

  return (
    <FormDialog
      description={t('sales.opportunities.loseDescription', {
        defaultValue: 'Record the deal as lost. A result reason is required.',
      })}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onSubmit={async () => {
        if (!opportunity) return;
        if (!resultReason.trim()) {
          throw new Error(
            t('sales.opportunities.reasonRequired', {
              defaultValue: 'A result reason is required.',
            }),
          );
        }
        await api.loseOpportunity(opportunity.id, resultReason.trim());
        onSaved();
      }}
      open={opportunity !== null}
      submitLabel={t('sales.opportunities.lose', { defaultValue: 'Mark lost' })}
      title={t('sales.opportunities.lose', { defaultValue: 'Mark lost' })}
    >
      <FormField
        label={t('sales.opportunities.resultReason', {
          defaultValue: 'Result reason',
        })}
        required
      >
        <textarea
          className='min-h-20 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
          onChange={(event) => setResultReason(event.target.value)}
          value={resultReason}
        />
      </FormField>
    </FormDialog>
  );
}
