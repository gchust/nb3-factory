import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router';
import { Pencil, Plus, Trash2, UserPlus, Wand2 } from 'lucide-react';

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
import { StatusBadge } from '../components/sales/status-badge';
import { UserSelect } from '../components/sales/user-select';
import { useSalesApi } from '../components/sales/use-sales-api';
import { LEAD_SOURCES, LEAD_STATUSES } from '../lib/sales-constants';
import { formatDate } from '../lib/sales-format';
import type { Lead } from '../lib/sales-api';

interface LeadFormState {
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  source: string;
  notes: string;
}

const EMPTY_FORM: LeadFormState = {
  companyName: '',
  contactName: '',
  phone: '',
  email: '',
  source: '',
  notes: '',
};

export default function LeadsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useSalesApi();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [assignLead, setAssignLead] = useState<Lead | null>(null);
  const [convertLead, setConvertLead] = useState<Lead | null>(null);
  const [deleteLead, setDeleteLead] = useState<Lead | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      setLeads(
        await api.listLeads({ q: q || undefined, status: status || undefined }),
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [api, q, status]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  return (
    <div className='space-y-6'>
      <PageHeader
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            {t('sales.leads.create', { defaultValue: 'New lead' })}
          </Button>
        }
        description={t('sales.leads.description', {
          defaultValue: 'Capture and qualify incoming leads',
        })}
        title={t('sales.leads.title', { defaultValue: 'Leads' })}
      />

      <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
        <Input
          className='sm:max-w-xs'
          onChange={(event) => setQ(event.target.value)}
          placeholder={t('sales.leads.search', {
            defaultValue: 'Search leads…',
          })}
          value={q}
        />
        <Select
          value={status}
          onValueChange={(value) => setStatus(value ?? '')}
        >
          <SelectTrigger className='sm:w-44'>
            <SelectValue
              placeholder={t('sales.leads.allStatuses', {
                defaultValue: 'All statuses',
              })}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value=''>
              {t('sales.leads.allStatuses', { defaultValue: 'All statuses' })}
            </SelectItem>
            {LEAD_STATUSES.map((item) => (
              <SelectItem key={item} value={item}>
                {t(`sales.leads.${item}`, { defaultValue: item })}
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
      ) : leads.length === 0 ? (
        <EmptyState
          message={t('sales.leads.empty', { defaultValue: 'No leads yet.' })}
        />
      ) : (
        <div className='overflow-x-auto rounded-xl border border-border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {t('sales.leads.leadNo', { defaultValue: 'No.' })}
                </TableHead>
                <TableHead>
                  {t('sales.leads.companyName', { defaultValue: 'Company' })}
                </TableHead>
                <TableHead>
                  {t('sales.leads.contactName', { defaultValue: 'Contact' })}
                </TableHead>
                <TableHead>
                  {t('sales.leads.phone', { defaultValue: 'Phone' })}
                </TableHead>
                <TableHead>
                  {t('sales.leads.source', { defaultValue: 'Source' })}
                </TableHead>
                <TableHead>
                  {t('sales.leads.status', { defaultValue: 'Status' })}
                </TableHead>
                <TableHead>
                  {t('sales.leads.createdAt', { defaultValue: 'Created' })}
                </TableHead>
                <TableHead className='text-right'>
                  {t('sales.actions.label', { defaultValue: 'Actions' })}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className='font-mono text-xs'>
                    {lead.leadNo}
                  </TableCell>
                  <TableCell className='font-medium'>
                    {lead.companyName ?? '—'}
                  </TableCell>
                  <TableCell>{lead.contactName ?? '—'}</TableCell>
                  <TableCell>{lead.phone ?? '—'}</TableCell>
                  <TableCell>
                    {lead.source
                      ? t(`sales.sources.${lead.source}`, {
                          defaultValue: lead.source,
                        })
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge prefix='leads' status={lead.status} />
                  </TableCell>
                  <TableCell>{formatDate(lead.createdAt)}</TableCell>
                  <TableCell>
                    <div className='flex justify-end gap-1'>
                      <Button
                        onClick={() => setAssignLead(lead)}
                        size='icon-sm'
                        title={t('sales.leads.assign', {
                          defaultValue: 'Assign',
                        })}
                        variant='ghost'
                      >
                        <UserPlus />
                      </Button>
                      {lead.status !== 'converted' ? (
                        <Button
                          onClick={() => setConvertLead(lead)}
                          size='icon-sm'
                          title={t('sales.leads.convert', {
                            defaultValue: 'Convert',
                          })}
                          variant='ghost'
                        >
                          <Wand2 />
                        </Button>
                      ) : null}
                      <Button
                        onClick={() => setEditLead(lead)}
                        size='icon-sm'
                        title={t('sales.actions.edit', {
                          defaultValue: 'Edit',
                        })}
                        variant='ghost'
                      >
                        <Pencil />
                      </Button>
                      <Button
                        onClick={() => setDeleteLead(lead)}
                        size='icon-sm'
                        title={t('sales.actions.delete', {
                          defaultValue: 'Delete',
                        })}
                        variant='ghost'
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <LeadFormDialog
        initial={null}
        onOpenChange={setCreateOpen}
        onSaved={() => void load()}
        open={createOpen}
      />
      <LeadFormDialog
        initial={editLead}
        onOpenChange={(open) => {
          if (!open) setEditLead(null);
        }}
        onSaved={() => void load()}
        open={editLead !== null}
      />
      <AssignLeadDialog
        lead={assignLead}
        onClose={() => setAssignLead(null)}
        onAssigned={() => void load()}
      />
      <ConfirmDialog
        description={t('sales.leads.convertConfirm', {
          defaultValue:
            'This creates a customer, a contact and an opportunity from the lead. This cannot be undone.',
        })}
        destructive={false}
        onConfirm={async () => {
          if (!convertLead) return;
          await api.convertLead(convertLead.id);
          await load();
        }}
        onOpenChange={(open) => {
          if (!open) setConvertLead(null);
        }}
        open={convertLead !== null}
        title={t('sales.leads.convert', { defaultValue: 'Convert lead' })}
      />
      <ConfirmDialog
        description={t('sales.leads.deleteConfirm', {
          defaultValue: 'This lead will be permanently deleted.',
        })}
        destructive
        onConfirm={async () => {
          if (!deleteLead) return;
          await api.deleteLead(deleteLead.id);
          await load();
        }}
        onOpenChange={(open) => {
          if (!open) setDeleteLead(null);
        }}
        open={deleteLead !== null}
        title={t('sales.actions.delete', { defaultValue: 'Delete' })}
      />
    </div>
  );
}

function LeadFormDialog({
  open,
  initial,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  initial: Lead | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useSalesApi();
  const [form, setForm] = useState<LeadFormState>(EMPTY_FORM);
  const [lastOpen, setLastOpen] = useState(open);

  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setForm(
        initial
          ? {
              companyName: initial.companyName ?? '',
              contactName: initial.contactName ?? '',
              phone: initial.phone ?? '',
              email: initial.email ?? '',
              source: initial.source ?? '',
              notes: initial.notes ?? '',
            }
          : EMPTY_FORM,
      );
    }
  }

  const set = (key: keyof LeadFormState) => (value: string | null) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const handleSubmit = async (): Promise<void> => {
    const input: Record<string, unknown> = {
      companyName: form.companyName || null,
      contactName: form.contactName || null,
      phone: form.phone || null,
      email: form.email || null,
      source: form.source || null,
      notes: form.notes || null,
    };
    if (initial) {
      await api.updateLead(initial.id, input);
    } else {
      await api.createLead(input);
    }
    onSaved();
  };

  return (
    <FormDialog
      description={
        initial
          ? t('sales.leads.editDescription', {
              defaultValue: 'Update the lead details.',
            })
          : t('sales.leads.createDescription', {
              defaultValue: 'Capture a new incoming lead.',
            })
      }
      onOpenChange={onOpenChange}
      onSubmit={handleSubmit}
      open={open}
      title={
        initial
          ? t('sales.leads.edit', { defaultValue: 'Edit lead' })
          : t('sales.leads.create', { defaultValue: 'New lead' })
      }
    >
      <FormField
        label={t('sales.leads.companyName', { defaultValue: 'Company' })}
      >
        <Input
          onChange={(event) => set('companyName')(event.target.value)}
          value={form.companyName}
        />
      </FormField>
      <div className='grid gap-4 sm:grid-cols-2'>
        <FormField
          label={t('sales.leads.contactName', { defaultValue: 'Contact' })}
        >
          <Input
            onChange={(event) => set('contactName')(event.target.value)}
            value={form.contactName}
          />
        </FormField>
        <FormField label={t('sales.leads.phone', { defaultValue: 'Phone' })}>
          <Input
            onChange={(event) => set('phone')(event.target.value)}
            value={form.phone}
          />
        </FormField>
      </div>
      <div className='grid gap-4 sm:grid-cols-2'>
        <FormField label={t('sales.leads.email', { defaultValue: 'Email' })}>
          <Input
            onChange={(event) => set('email')(event.target.value)}
            type='email'
            value={form.email}
          />
        </FormField>
        <FormField label={t('sales.leads.source', { defaultValue: 'Source' })}>
          <Select value={form.source} onValueChange={set('source')}>
            <SelectTrigger className='w-full'>
              <SelectValue
                placeholder={t('sales.leads.selectSource', {
                  defaultValue: 'Select source',
                })}
              />
            </SelectTrigger>
            <SelectContent>
              {LEAD_SOURCES.map((source) => (
                <SelectItem key={source} value={source}>
                  {t(`sales.sources.${source}`, { defaultValue: source })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>
      <FormField label={t('sales.leads.notes', { defaultValue: 'Notes' })}>
        <textarea
          className='min-h-20 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
          onChange={(event) => set('notes')(event.target.value)}
          value={form.notes}
        />
      </FormField>
    </FormDialog>
  );
}

function AssignLeadDialog({
  lead,
  onClose,
  onAssigned,
}: {
  lead: Lead | null;
  onClose: () => void;
  onAssigned: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useSalesApi();
  const [ownerId, setOwnerId] = useState('');
  const [lastLead, setLastLead] = useState(lead);

  if (lead !== lastLead) {
    setLastLead(lead);
    if (lead) setOwnerId(lead.ownerId ?? '');
  }

  return (
    <FormDialog
      description={t('sales.leads.assignDescription', {
        defaultValue: 'Choose the sales person who will own this lead.',
      })}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onSubmit={async () => {
        if (!lead) return;
        await api.assignLead(lead.id, ownerId);
        onAssigned();
      }}
      open={lead !== null}
      submitLabel={t('sales.leads.assign', { defaultValue: 'Assign' })}
      title={t('sales.leads.assign', { defaultValue: 'Assign lead' })}
    >
      <FormField
        label={t('sales.leads.owner', { defaultValue: 'Owner' })}
        required
      >
        <UserSelect onValueChange={setOwnerId} value={ownerId} />
      </FormField>
      {lead ? (
        <p className='text-sm text-muted-foreground'>
          {t('sales.leads.assigning', { defaultValue: 'Assigning' })}:{' '}
          <Link
            className='font-medium text-primary hover:underline'
            to={`/leads`}
          >
            {lead.companyName ?? lead.leadNo}
          </Link>
        </p>
      ) : null}
    </FormDialog>
  );
}
