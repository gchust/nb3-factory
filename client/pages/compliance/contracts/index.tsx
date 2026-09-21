import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router';

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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { useAccess } from '../access.js';
import {
  complianceRequest,
  CONTRACT_STATUSES,
  errorMessageKey,
  formatAmount,
  formatDate,
  normalizeError,
  type Contract,
  type NormalizedError,
  type Supplier,
} from '../api.js';
import { SimpleSelect } from '../components/simple-select.js';
import { StatusBadge } from '../components/status-badge.js';
import { EmptyState, ErrorState, LoadingState } from '../components/state.js';
import { contractStatusKey, contractStatusTone } from '../labels.js';
import { canManageOrganization } from '../permissions.js';

interface ContractForm {
  supplierId: string;
  contractNo: string;
  title: string;
  signedAt: string;
  startDate: string;
  endDate: string;
  amount: string;
  currency: string;
  status: string;
  legalNotes: string;
}

const EMPTY_CONTRACT: ContractForm = {
  supplierId: '',
  contractNo: '',
  title: '',
  signedAt: '',
  startDate: '',
  endDate: '',
  amount: '',
  currency: 'CNY',
  status: 'active',
  legalNotes: '',
};

export default function ContractsPage(): ReactElement {
  const { t } = useTranslation();
  const {
    api,
    access,
    loading: accessLoading,
    error: accessError,
  } = useAccess();
  const [contracts, setContracts] = useState<readonly Contract[]>([]);
  const [suppliers, setSuppliers] = useState<readonly Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<NormalizedError>();
  const [notice, setNotice] = useState<string>();
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<ContractForm>(EMPTY_CONTRACT);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [contractData, supplierData] = await Promise.all([
        complianceRequest<Contract[]>(api, '/contracts', {
          query: { status: status || undefined },
        }),
        complianceRequest<Supplier[]>(api, '/suppliers'),
      ]);
      setContracts(contractData);
      setSuppliers(supplierData);
    } catch (cause) {
      setError(normalizeError(cause));
    } finally {
      setLoading(false);
    }
  }, [api, status]);

  useEffect(() => {
    if (accessLoading || accessError) return;
    // Defer to a microtask so the effect body itself does not synchronously update state.
    queueMicrotask(() => void reload());
  }, [accessLoading, accessError, reload]);

  const manageableSuppliers = suppliers.filter((supplier) =>
    canManageOrganization(access, supplier.organizationId),
  );

  async function handleCreate(): Promise<void> {
    setSaving(true);
    setNotice(undefined);
    try {
      await complianceRequest<Contract>(api, '/contracts', {
        method: 'POST',
        json: {
          supplierId: Number(form.supplierId),
          contractNo: form.contractNo,
          title: form.title,
          signedAt: form.signedAt || undefined,
          startDate: form.startDate || undefined,
          endDate: form.endDate || undefined,
          amount: form.amount === '' ? undefined : Number(form.amount),
          currency: form.currency || undefined,
          status: form.status || undefined,
          legalNotes: form.legalNotes || undefined,
        },
      });
      setCreating(false);
      setForm(EMPTY_CONTRACT);
      await reload();
    } catch (cause) {
      const normalized = normalizeError(cause);
      setNotice(
        t(errorMessageKey(normalized), { defaultValue: normalized.message }),
      );
    } finally {
      setSaving(false);
    }
  }

  if (accessLoading) {
    return (
      <PageContainer>
        <LoadingState />
      </PageContainer>
    );
  }

  if (accessError) {
    return (
      <PageContainer>
        <ErrorState error={accessError} onRetry={() => void reload()} />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('compliance.contracts.title', {
          defaultValue: 'Contract ledger',
        })}
        description={t('compliance.contracts.description', {
          defaultValue:
            'Contracts with their suppliers, validity period and status.',
        })}
        actions={
          manageableSuppliers.length > 0 ? (
            <Button
              onClick={() => setCreating(true)}
              data-testid='compliance-contract-create'
            >
              <PlusIcon />
              {t('compliance.contracts.create', {
                defaultValue: 'New contract',
              })}
            </Button>
          ) : null
        }
      />

      {notice ? (
        <p className='text-sm text-destructive' role='alert'>
          {notice}
        </p>
      ) : null}

      <div className='w-full sm:w-52'>
        <Label>
          {t('compliance.contracts.status', { defaultValue: 'Status' })}
        </Label>
        <SimpleSelect
          value={status}
          onChange={setStatus}
          className='mt-1'
          placeholder={t('compliance.filters.all', { defaultValue: 'All' })}
          options={CONTRACT_STATUSES.map((value) => ({
            value,
            label: t(contractStatusKey(value), { defaultValue: value }),
          }))}
        />
      </div>

      {loading ? <LoadingState /> : null}
      {error ? (
        <ErrorState error={error} onRetry={() => void reload()} />
      ) : null}

      {!loading && !error && contracts.length === 0 ? (
        <EmptyState>
          {t('compliance.contracts.empty', {
            defaultValue: 'No contracts found.',
          })}
        </EmptyState>
      ) : null}

      {!loading && !error && contracts.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                {t('compliance.contracts.no', { defaultValue: 'Contract no.' })}
              </TableHead>
              <TableHead>
                {t('compliance.contracts.contractTitle', {
                  defaultValue: 'Title',
                })}
              </TableHead>
              <TableHead>
                {t('compliance.contracts.supplier', {
                  defaultValue: 'Supplier',
                })}
              </TableHead>
              <TableHead>
                {t('compliance.contracts.amount', { defaultValue: 'Amount' })}
              </TableHead>
              <TableHead>
                {t('compliance.contracts.period', { defaultValue: 'Period' })}
              </TableHead>
              <TableHead>
                {t('compliance.contracts.status', { defaultValue: 'Status' })}
              </TableHead>
              <TableHead className='text-right'>
                {t('compliance.contracts.actions', { defaultValue: 'Actions' })}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contracts.map((contract) => (
              <TableRow key={contract.id}>
                <TableCell className='font-mono text-xs'>
                  {contract.contractNo}
                </TableCell>
                <TableCell>
                  <Link
                    to={`/compliance/contracts/${contract.id}`}
                    className='font-medium hover:underline'
                  >
                    {contract.title}
                  </Link>
                </TableCell>
                <TableCell>{contract.supplierName ?? '—'}</TableCell>
                <TableCell>
                  {formatAmount(contract.amount, contract.currency)}
                </TableCell>
                <TableCell>
                  {formatDate(contract.startDate)} ~{' '}
                  {formatDate(contract.endDate)}
                </TableCell>
                <TableCell>
                  <StatusBadge
                    tone={contractStatusTone(contract.status)}
                    labelKey={contractStatusKey(contract.status)}
                  />
                </TableCell>
                <TableCell>
                  <div className='flex justify-end'>
                    <Button
                      variant='outline'
                      size='sm'
                      render={
                        <Link to={`/compliance/contracts/${contract.id}`} />
                      }
                    >
                      {t('compliance.contracts.view', { defaultValue: 'View' })}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>
              {t('compliance.contracts.createTitle', {
                defaultValue: 'New contract',
              })}
            </DialogTitle>
            <DialogDescription>
              {t('compliance.contracts.createDescription', {
                defaultValue:
                  'The contract inherits its organization from the supplier.',
              })}
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='sm:col-span-2'>
              <Label>
                {t('compliance.contracts.supplier', {
                  defaultValue: 'Supplier',
                })}
              </Label>
              <SimpleSelect
                className='mt-1'
                value={form.supplierId}
                onChange={(value) => setForm({ ...form, supplierId: value })}
                placeholder={t('compliance.contracts.selectSupplier', {
                  defaultValue: 'Select a supplier',
                })}
                options={manageableSuppliers.map((supplier) => ({
                  value: String(supplier.id),
                  label: `${supplier.name} (${supplier.code})`,
                }))}
              />
            </div>
            <div>
              <Label htmlFor='contract-no'>
                {t('compliance.contracts.no', { defaultValue: 'Contract no.' })}
              </Label>
              <Input
                id='contract-no'
                className='mt-1'
                value={form.contractNo}
                onChange={(event) =>
                  setForm({ ...form, contractNo: event.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor='contract-status'>
                {t('compliance.contracts.status', { defaultValue: 'Status' })}
              </Label>
              <SimpleSelect
                className='mt-1'
                value={form.status}
                onChange={(value) => setForm({ ...form, status: value })}
                options={CONTRACT_STATUSES.map((value) => ({
                  value,
                  label: t(contractStatusKey(value), { defaultValue: value }),
                }))}
              />
            </div>
            <div className='sm:col-span-2'>
              <Label htmlFor='contract-title'>
                {t('compliance.contracts.contractTitle', {
                  defaultValue: 'Title',
                })}
              </Label>
              <Input
                id='contract-title'
                className='mt-1'
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor='contract-signed'>
                {t('compliance.contracts.signedAt', {
                  defaultValue: 'Signed at',
                })}
              </Label>
              <Input
                id='contract-signed'
                type='date'
                className='mt-1'
                value={form.signedAt}
                onChange={(event) =>
                  setForm({ ...form, signedAt: event.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor='contract-amount'>
                {t('compliance.contracts.amount', { defaultValue: 'Amount' })}
              </Label>
              <Input
                id='contract-amount'
                type='number'
                className='mt-1'
                value={form.amount}
                onChange={(event) =>
                  setForm({ ...form, amount: event.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor='contract-start'>
                {t('compliance.contracts.startDate', {
                  defaultValue: 'Start date',
                })}
              </Label>
              <Input
                id='contract-start'
                type='date'
                className='mt-1'
                value={form.startDate}
                onChange={(event) =>
                  setForm({ ...form, startDate: event.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor='contract-end'>
                {t('compliance.contracts.endDate', {
                  defaultValue: 'End date',
                })}
              </Label>
              <Input
                id='contract-end'
                type='date'
                className='mt-1'
                value={form.endDate}
                onChange={(event) =>
                  setForm({ ...form, endDate: event.target.value })
                }
              />
            </div>
            <div className='sm:col-span-2'>
              <Label htmlFor='contract-notes'>
                {t('compliance.contracts.legalNotes', {
                  defaultValue: 'Legal notes',
                })}
              </Label>
              <Textarea
                id='contract-notes'
                className='mt-1'
                value={form.legalNotes}
                onChange={(event) =>
                  setForm({ ...form, legalNotes: event.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              type='button'
              onClick={() => setCreating(false)}
            >
              {t('actions.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button
              type='button'
              disabled={
                saving ||
                !form.supplierId ||
                !form.contractNo.trim() ||
                !form.title.trim()
              }
              onClick={() => void handleCreate()}
            >
              {t('actions.save', { defaultValue: 'Save' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
