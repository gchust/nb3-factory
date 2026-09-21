import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeftIcon, PencilIcon } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link, useParams } from 'react-router';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
} from '../api.js';
import { FileAttachmentManager } from '../components/file-attachment-manager.js';
import { SimpleSelect } from '../components/simple-select.js';
import { StatusBadge } from '../components/status-badge.js';
import { ErrorState, LoadingState } from '../components/state.js';
import { contractStatusKey, contractStatusTone } from '../labels.js';
import { canManageContract } from '../permissions.js';

function toDateInput(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export default function ContractDetailPage(): ReactElement {
  const { t } = useTranslation();
  const params = useParams();
  const contractId = Number(params.id);
  const {
    api,
    access,
    loading: accessLoading,
    error: accessError,
  } = useAccess();

  const [contract, setContract] = useState<Contract>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<NormalizedError>();
  const [notice, setNotice] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    signedAt: '',
    startDate: '',
    endDate: '',
    amount: '',
    currency: 'CNY',
    status: 'active',
    legalNotes: '',
  });

  const reload = useCallback(async () => {
    if (!Number.isFinite(contractId)) {
      setError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Contract not found.',
      });
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      setContract(
        await complianceRequest<Contract>(api, `/contracts/${contractId}`),
      );
    } catch (cause) {
      setError(normalizeError(cause));
    } finally {
      setLoading(false);
    }
  }, [api, contractId]);

  useEffect(() => {
    if (accessLoading || accessError) return;
    // Defer to a microtask so the effect body itself does not synchronously update state.
    queueMicrotask(() => void reload());
  }, [accessLoading, accessError, reload]);

  function openEdit(): void {
    if (!contract) return;
    setForm({
      title: contract.title,
      signedAt: toDateInput(contract.signedAt),
      startDate: toDateInput(contract.startDate),
      endDate: toDateInput(contract.endDate),
      amount:
        contract.amount === null || contract.amount === undefined
          ? ''
          : String(contract.amount),
      currency: contract.currency ?? 'CNY',
      status: contract.status,
      legalNotes: contract.legalNotes ?? '',
    });
    setEditing(true);
  }

  async function save(): Promise<void> {
    if (!contract) return;
    setSaving(true);
    setNotice(undefined);
    try {
      await complianceRequest<Contract>(api, `/contracts/${contract.id}`, {
        method: 'PATCH',
        json: {
          title: form.title,
          signedAt: form.signedAt || null,
          startDate: form.startDate || null,
          endDate: form.endDate || null,
          amount: form.amount === '' ? null : Number(form.amount),
          currency: form.currency || null,
          status: form.status,
          legalNotes: form.legalNotes || null,
        },
      });
      setEditing(false);
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

  if (accessLoading || loading) {
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

  if (error || !contract) {
    return (
      <PageContainer>
        <ErrorState
          error={
            error ?? {
              status: 404,
              code: 'NOT_FOUND',
              message: 'Contract not found.',
            }
          }
          onRetry={() => void reload()}
        />
      </PageContainer>
    );
  }

  const manage = canManageContract(access, contract);

  return (
    <PageContainer>
      <Button
        variant='ghost'
        size='sm'
        render={<Link to='/compliance/contracts' />}
      >
        <ArrowLeftIcon />
        {t('compliance.contracts.back', { defaultValue: 'Back to contracts' })}
      </Button>

      <PageHeader
        title={contract.title}
        description={`${contract.contractNo} · ${contract.supplierName ?? ''}`}
        actions={
          manage ? (
            <Button variant='outline' onClick={openEdit}>
              <PencilIcon />
              {t('compliance.contracts.edit', { defaultValue: 'Edit' })}
            </Button>
          ) : null
        }
      />

      {notice ? (
        <p className='text-sm text-destructive' role='alert'>
          {notice}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            {t('compliance.contracts.detail', {
              defaultValue: 'Contract details',
            })}
          </CardTitle>
          <StatusBadge
            tone={contractStatusTone(contract.status)}
            labelKey={contractStatusKey(contract.status)}
          />
        </CardHeader>
        <CardContent className='grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3'>
          <Field
            label={t('compliance.contracts.no', {
              defaultValue: 'Contract no.',
            })}
            value={contract.contractNo}
          />
          <Field
            label={t('compliance.contracts.supplier', {
              defaultValue: 'Supplier',
            })}
            value={contract.supplierName ?? `#${contract.supplierId}`}
          />
          <Field
            label={t('compliance.contracts.organization', {
              defaultValue: 'Organization',
            })}
            value={contract.organizationName}
          />
          <Field
            label={t('compliance.contracts.signedAt', {
              defaultValue: 'Signed at',
            })}
            value={formatDate(contract.signedAt)}
          />
          <Field
            label={t('compliance.contracts.startDate', {
              defaultValue: 'Start date',
            })}
            value={formatDate(contract.startDate)}
          />
          <Field
            label={t('compliance.contracts.endDate', {
              defaultValue: 'End date',
            })}
            value={formatDate(contract.endDate)}
          />
          <Field
            label={t('compliance.contracts.amount', { defaultValue: 'Amount' })}
            value={formatAmount(contract.amount, contract.currency)}
          />
          <div className='sm:col-span-2 lg:col-span-3'>
            <Field
              label={t('compliance.contracts.legalNotes', {
                defaultValue: 'Legal notes',
              })}
              value={contract.legalNotes}
            />
          </div>
        </CardContent>
      </Card>

      <FileAttachmentManager
        contractId={contract.id}
        supplierId={contract.supplierId}
        organizationId={contract.organizationId}
        canManage={manage}
      />

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>
              {t('compliance.contracts.editTitle', {
                defaultValue: 'Edit contract',
              })}
            </DialogTitle>
          </DialogHeader>
          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='sm:col-span-2'>
              <Label htmlFor='c-title'>
                {t('compliance.contracts.contractTitle', {
                  defaultValue: 'Title',
                })}
              </Label>
              <Input
                id='c-title'
                className='mt-1'
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor='c-status'>
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
            <div>
              <Label htmlFor='c-signed'>
                {t('compliance.contracts.signedAt', {
                  defaultValue: 'Signed at',
                })}
              </Label>
              <Input
                id='c-signed'
                type='date'
                className='mt-1'
                value={form.signedAt}
                onChange={(event) =>
                  setForm({ ...form, signedAt: event.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor='c-start'>
                {t('compliance.contracts.startDate', {
                  defaultValue: 'Start date',
                })}
              </Label>
              <Input
                id='c-start'
                type='date'
                className='mt-1'
                value={form.startDate}
                onChange={(event) =>
                  setForm({ ...form, startDate: event.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor='c-end'>
                {t('compliance.contracts.endDate', {
                  defaultValue: 'End date',
                })}
              </Label>
              <Input
                id='c-end'
                type='date'
                className='mt-1'
                value={form.endDate}
                onChange={(event) =>
                  setForm({ ...form, endDate: event.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor='c-amount'>
                {t('compliance.contracts.amount', { defaultValue: 'Amount' })}
              </Label>
              <Input
                id='c-amount'
                type='number'
                className='mt-1'
                value={form.amount}
                onChange={(event) =>
                  setForm({ ...form, amount: event.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor='c-currency'>
                {t('compliance.contracts.currency', {
                  defaultValue: 'Currency',
                })}
              </Label>
              <Input
                id='c-currency'
                className='mt-1'
                value={form.currency}
                onChange={(event) =>
                  setForm({ ...form, currency: event.target.value })
                }
              />
            </div>
            <div className='sm:col-span-2'>
              <Label htmlFor='c-notes'>
                {t('compliance.contracts.legalNotes', {
                  defaultValue: 'Legal notes',
                })}
              </Label>
              <Textarea
                id='c-notes'
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
              onClick={() => setEditing(false)}
            >
              {t('actions.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button type='button' disabled={saving} onClick={() => void save()}>
              {t('actions.save', { defaultValue: 'Save' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function Field({
  label,
  value,
}: {
  readonly label: string;
  readonly value?: string | null;
}): ReactElement {
  return (
    <div>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='mt-0.5'>{value && value !== '' ? value : '—'}</dd>
    </div>
  );
}
