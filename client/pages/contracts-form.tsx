import { useTranslation } from '@nocobase/i18n/client';
import { apiClientToken, useService } from '@nocobase/app-client';
import { ArrowLeft, Save } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router';

import { Loading } from '@/components/loading';
import { SelectField } from '@/components/select-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  apiErrorCode,
  createContract,
  fetchContract,
  updateContract,
  type ContractInput,
} from '@/lib/contracts';

const CONTRACT_TYPES = ['sale', 'purchase', 'service', 'lease'] as const;
const CONTRACT_STATUSES = ['draft', 'active', 'expired', 'terminated'] as const;

interface FormState {
  contractNo: string;
  name: string;
  counterparty: string;
  type: string;
  status: string;
  signedDate: string;
  effectiveDate: string;
  expiryDate: string;
  amount: string;
}

const EMPTY: FormState = {
  contractNo: '',
  name: '',
  counterparty: '',
  type: 'sale',
  status: 'draft',
  signedDate: '',
  effectiveDate: '',
  expiryDate: '',
  amount: '0',
};

export default function ContractFormPage(): ReactElement {
  const api = useService(apiClientToken);
  const navigate = useNavigate();
  const { id } = useParams();
  const { t } = useTranslation();
  const editing = Boolean(id);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [loaded, setLoaded] = useState(!editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!id) return;
    let active = true;
    fetchContract(api, id).then(
      (detail) => {
        if (!active) return;
        const contract = detail.contract;
        setForm({
          contractNo: contract.contractNo,
          name: contract.name,
          counterparty: contract.counterparty,
          type: contract.type,
          status: contract.status,
          signedDate: contract.signedDate ?? '',
          effectiveDate: contract.effectiveDate ?? '',
          expiryDate: contract.expiryDate ?? '',
          amount: String(contract.amount),
        });
        setError(undefined);
        setLoaded(true);
      },
      (cause: unknown) => {
        if (!active) return;
        setError(
          t(`contracts.errors.${apiErrorCode(cause) ?? 'loadFailed'}`, {
            defaultValue: 'Something went wrong while loading.',
          }),
        );
        setLoaded(true);
      },
    );
    return () => {
      active = false;
    };
  }, [api, id, t]);

  const update = (patch: Partial<FormState>): void =>
    setForm((current) => ({ ...current, ...patch }));

  const submit = async (): Promise<void> => {
    if (
      !form.contractNo.trim() ||
      !form.name.trim() ||
      !form.counterparty.trim()
    ) {
      setError(
        t('contracts.form.requiredError', {
          defaultValue: 'Please fill in every required field.',
        }),
      );
      return;
    }
    const amount = Number(form.amount || 0);
    if (!Number.isFinite(amount) || amount < 0) {
      setError(
        t('contracts.form.amountError', {
          defaultValue: 'Amount must be a non-negative number.',
        }),
      );
      return;
    }

    const input: ContractInput = {
      contractNo: form.contractNo.trim(),
      name: form.name.trim(),
      counterparty: form.counterparty.trim(),
      type: form.type,
      status: form.status,
      signedDate: form.signedDate || null,
      effectiveDate: form.effectiveDate || null,
      expiryDate: form.expiryDate || null,
      amount,
    };

    setSaving(true);
    setError(undefined);
    try {
      if (editing && id) {
        await updateContract(api, id, input);
        void navigate(`/contracts/${id}`);
      } else {
        const created = await createContract(api, input);
        void navigate(`/contracts/${created}`);
      }
    } catch (cause) {
      setError(
        t(`contracts.errors.${apiErrorCode(cause) ?? 'saveFailed'}`, {
          defaultValue: 'Could not save the contract.',
        }),
      );
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return (
      <Loading
        className='min-h-[60svh]'
        label={t('contracts.loading', { defaultValue: 'Loading contracts' })}
      />
    );
  }

  const typeOptions = CONTRACT_TYPES.map((value) => ({
    value,
    label: t(`contracts.type.${value}`, { defaultValue: value }),
  }));
  const statusOptions = CONTRACT_STATUSES.map((value) => ({
    value,
    label: t(`contracts.status.${value}`, { defaultValue: value }),
  }));

  return (
    <section className='mx-auto w-full max-w-3xl space-y-6 p-6'>
      <header className='flex items-center justify-between gap-4'>
        <h1 className='font-heading text-2xl font-semibold tracking-tight'>
          {editing
            ? t('contracts.form.editTitle', { defaultValue: 'Edit contract' })
            : t('contracts.form.createTitle', { defaultValue: 'New contract' })}
        </h1>
        <Button
          onClick={() => {
            void navigate(editing && id ? `/contracts/${id}` : '/contracts');
          }}
          type='button'
          variant='outline'
        >
          <ArrowLeft />
          {t('contracts.actions.back', { defaultValue: 'Back to list' })}
        </Button>
      </header>

      <form
        className='space-y-5 rounded-lg border border-border bg-card p-6'
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className='grid gap-4 sm:grid-cols-2'>
          <TextField
            id='contract-no'
            label={t('contracts.fields.contractNo', {
              defaultValue: 'Contract no.',
            })}
            onChange={(value) => update({ contractNo: value })}
            placeholder={t('contracts.form.placeholderContractNo', {
              defaultValue: 'e.g. HT-2026-0006',
            })}
            required
            value={form.contractNo}
          />
          <TextField
            id='contract-name'
            label={t('contracts.fields.name', {
              defaultValue: 'Contract name',
            })}
            onChange={(value) => update({ name: value })}
            placeholder={t('contracts.form.placeholderName', {
              defaultValue: 'Contract name',
            })}
            required
            value={form.name}
          />
          <TextField
            id='contract-counterparty'
            label={t('contracts.fields.counterparty', {
              defaultValue: 'Counterparty',
            })}
            onChange={(value) => update({ counterparty: value })}
            placeholder={t('contracts.form.placeholderCounterparty', {
              defaultValue: 'Counterparty',
            })}
            required
            value={form.counterparty}
          />
          <div className='space-y-2'>
            <Label htmlFor='contract-type'>
              {t('contracts.fields.type', { defaultValue: 'Type' })}
            </Label>
            <SelectField
              id='contract-type'
              onChange={(value) => update({ type: value })}
              options={typeOptions}
              value={form.type}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='contract-status'>
              {t('contracts.fields.status', { defaultValue: 'Status' })}
            </Label>
            <SelectField
              id='contract-status'
              onChange={(value) => update({ status: value })}
              options={statusOptions}
              value={form.status}
            />
          </div>
          <TextField
            id='contract-amount'
            label={t('contracts.fields.amount', { defaultValue: 'Amount' })}
            onChange={(value) => update({ amount: value })}
            placeholder={t('contracts.form.placeholderAmount', {
              defaultValue: '0.00',
            })}
            step='0.01'
            type='number'
            value={form.amount}
          />
          <TextField
            id='contract-signed'
            label={t('contracts.fields.signedDate', {
              defaultValue: 'Signed date',
            })}
            onChange={(value) => update({ signedDate: value })}
            type='date'
            value={form.signedDate}
          />
          <TextField
            id='contract-effective'
            label={t('contracts.fields.effectiveDate', {
              defaultValue: 'Effective date',
            })}
            onChange={(value) => update({ effectiveDate: value })}
            type='date'
            value={form.effectiveDate}
          />
          <TextField
            id='contract-expiry'
            label={t('contracts.fields.expiryDate', {
              defaultValue: 'Expiry date',
            })}
            onChange={(value) => update({ expiryDate: value })}
            type='date'
            value={form.expiryDate}
          />
        </div>

        {error ? (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className='flex items-center gap-2'>
          <Button disabled={saving} type='submit'>
            <Save />
            {saving
              ? t('contracts.form.processing', { defaultValue: 'Saving…' })
              : t('contracts.actions.save', { defaultValue: 'Save' })}
          </Button>
          <Button
            onClick={() => {
              void navigate(editing && id ? `/contracts/${id}` : '/contracts');
            }}
            type='button'
            variant='ghost'
          >
            {t('contracts.actions.cancel', { defaultValue: 'Cancel' })}
          </Button>
        </div>
      </form>
    </section>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required = false,
  step,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
  readonly type?: string;
  readonly required?: boolean;
  readonly step?: string;
}): ReactElement {
  return (
    <div className='space-y-2'>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        step={step}
        type={type}
        value={value}
      />
    </div>
  );
}
