import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  OPPORTUNITY_STAGES,
  type ContactInput,
  type CustomerInput,
  type CustomerRecord,
  type OpportunityInput,
  type OpportunityStage,
} from './api.js';

interface FieldProps {
  readonly label: string;
  readonly htmlFor: string;
  readonly error?: string | undefined;
  readonly children: ReactNode;
}

function FormField({ label, htmlFor, error, children }: FieldProps) {
  return (
    <div className='flex flex-col gap-1.5'>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className='text-xs text-destructive'>{error}</p> : null}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className='rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive'>
      {message}
    </p>
  );
}

export function FormActions({
  submitting,
  onCancel,
  submitLabel,
}: {
  readonly submitting: boolean;
  readonly onCancel: () => void;
  readonly submitLabel: string;
}) {
  const { t } = useTranslation();
  return (
    <div className='flex justify-end gap-2 pt-2'>
      <Button
        type='button'
        variant='outline'
        onClick={onCancel}
        disabled={submitting}
      >
        {t('crm.common.cancel')}
      </Button>
      <Button type='submit' disabled={submitting}>
        {submitting ? t('crm.common.saving') : submitLabel}
      </Button>
    </div>
  );
}

interface CustomerFormProps {
  readonly initial?:
    { readonly name: string; readonly industry: string | null } | undefined;
  readonly submitting: boolean;
  readonly error?: string | null;
  readonly onSubmit: (values: CustomerInput) => void;
  readonly onCancel: () => void;
}

export function CustomerForm({
  initial,
  submitting,
  error,
  onSubmit,
  onCancel,
}: CustomerFormProps) {
  const { t } = useTranslation();
  const nameId = useId();
  const industryId = useId();
  const [name, setName] = useState(initial?.name ?? '');
  const [industry, setIndustry] = useState(initial?.industry ?? '');
  const [nameError, setNameError] = useState<string | undefined>();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(t('crm.common.nameRequired'));
      return;
    }
    setNameError(undefined);
    onSubmit({ name: trimmed, industry: industry.trim() || null });
  }

  return (
    <form className='flex flex-col gap-4' onSubmit={handleSubmit} noValidate>
      <FormError message={error ?? null} />
      <FormField
        label={t('crm.customers.name')}
        htmlFor={nameId}
        error={nameError}
      >
        <Input
          id={nameId}
          value={name}
          required
          autoFocus
          aria-invalid={nameError ? true : undefined}
          placeholder={t('crm.customers.namePlaceholder')}
          onChange={(event) => setName(event.target.value)}
        />
      </FormField>
      <FormField label={t('crm.customers.industry')} htmlFor={industryId}>
        <Input
          id={industryId}
          value={industry}
          placeholder={t('crm.customers.industryPlaceholder')}
          onChange={(event) => setIndustry(event.target.value)}
        />
      </FormField>
      <FormActions
        submitting={submitting}
        onCancel={onCancel}
        submitLabel={t('crm.common.save')}
      />
    </form>
  );
}

interface ContactFormProps {
  readonly customers: readonly CustomerRecord[];
  readonly initial?:
    | {
        readonly name: string;
        readonly contactInfo: string | null;
        readonly customerId: number;
      }
    | undefined;
  readonly submitting: boolean;
  readonly error?: string | null;
  readonly onSubmit: (values: ContactInput) => void;
  readonly onCancel: () => void;
}

export function ContactForm({
  customers,
  initial,
  submitting,
  error,
  onSubmit,
  onCancel,
}: ContactFormProps) {
  const { t } = useTranslation();
  const nameId = useId();
  const infoId = useId();
  const customerId = useId();
  const [name, setName] = useState(initial?.name ?? '');
  const [contactInfo, setContactInfo] = useState(initial?.contactInfo ?? '');
  const [customer, setCustomer] = useState<number | null>(
    initial?.customerId ?? null,
  );
  const [errors, setErrors] = useState<{ name?: string; customer?: string }>(
    {},
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    const nextErrors: { name?: string; customer?: string } = {};
    if (!trimmed) nextErrors.name = t('crm.common.nameRequired');
    if (customer === null)
      nextErrors.customer = t('crm.contacts.customerRequired');
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    onSubmit({
      name: trimmed,
      contactInfo: contactInfo.trim() || null,
      customerId: customer as number,
    });
  }

  return (
    <form className='flex flex-col gap-4' onSubmit={handleSubmit} noValidate>
      <FormError message={error ?? null} />
      <FormField
        label={t('crm.contacts.name')}
        htmlFor={nameId}
        error={errors.name}
      >
        <Input
          id={nameId}
          value={name}
          required
          autoFocus
          aria-invalid={errors.name ? true : undefined}
          placeholder={t('crm.contacts.namePlaceholder')}
          onChange={(event) => setName(event.target.value)}
        />
      </FormField>
      <FormField
        label={t('crm.contacts.customer')}
        htmlFor={customerId}
        error={errors.customer}
      >
        <Select
          id={customerId}
          value={customer}
          required
          onValueChange={setCustomer}
        >
          <SelectTrigger className='w-full'>
            <SelectValue placeholder={t('crm.contacts.customerPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {customers.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <FormField label={t('crm.contacts.contactInfo')} htmlFor={infoId}>
        <Input
          id={infoId}
          value={contactInfo}
          placeholder={t('crm.contacts.contactInfoPlaceholder')}
          onChange={(event) => setContactInfo(event.target.value)}
        />
      </FormField>
      <FormActions
        submitting={submitting}
        onCancel={onCancel}
        submitLabel={t('crm.common.save')}
      />
    </form>
  );
}

interface OpportunityFormProps {
  readonly customers: readonly CustomerRecord[];
  readonly initial?:
    | {
        readonly name: string;
        readonly customerId: number;
        readonly amount: number;
        readonly stage: OpportunityStage;
      }
    | undefined;
  readonly submitting: boolean;
  readonly error?: string | null;
  readonly onSubmit: (values: OpportunityInput) => void;
  readonly onCancel: () => void;
}

export function OpportunityForm({
  customers,
  initial,
  submitting,
  error,
  onSubmit,
  onCancel,
}: OpportunityFormProps) {
  const { t } = useTranslation();
  const nameId = useId();
  const customerId = useId();
  const amountId = useId();
  const stageId = useId();
  const [name, setName] = useState(initial?.name ?? '');
  const [customer, setCustomer] = useState<number | null>(
    initial?.customerId ?? null,
  );
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [stage, setStage] = useState<OpportunityStage>(
    initial?.stage ?? 'following',
  );
  const [errors, setErrors] = useState<{
    name?: string;
    customer?: string;
    amount?: string;
  }>({});

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: { name?: string; customer?: string; amount?: string } =
      {};
    const trimmed = name.trim();
    if (!trimmed) nextErrors.name = t('crm.common.nameRequired');
    if (customer === null)
      nextErrors.customer = t('crm.opportunities.customerRequired');

    const trimmedAmount = amount.trim();
    const parsed = trimmedAmount === '' ? Number.NaN : Number(trimmedAmount);
    if (trimmedAmount === '' || !Number.isFinite(parsed) || parsed < 0) {
      nextErrors.amount = t('crm.opportunities.amountInvalid');
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    onSubmit({
      name: trimmed,
      customerId: customer as number,
      amount: parsed,
      stage,
    });
  }

  return (
    <form className='flex flex-col gap-4' onSubmit={handleSubmit} noValidate>
      <FormError message={error ?? null} />
      <FormField
        label={t('crm.opportunities.name')}
        htmlFor={nameId}
        error={errors.name}
      >
        <Input
          id={nameId}
          value={name}
          required
          autoFocus
          aria-invalid={errors.name ? true : undefined}
          placeholder={t('crm.opportunities.namePlaceholder')}
          onChange={(event) => setName(event.target.value)}
        />
      </FormField>
      <FormField
        label={t('crm.opportunities.customer')}
        htmlFor={customerId}
        error={errors.customer}
      >
        <Select
          id={customerId}
          value={customer}
          required
          onValueChange={setCustomer}
        >
          <SelectTrigger className='w-full'>
            <SelectValue
              placeholder={t('crm.opportunities.customerPlaceholder')}
            />
          </SelectTrigger>
          <SelectContent>
            {customers.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <FormField
        label={t('crm.opportunities.amount')}
        htmlFor={amountId}
        error={errors.amount}
      >
        <Input
          id={amountId}
          type='number'
          min='0'
          step='0.01'
          value={amount}
          required
          aria-invalid={errors.amount ? true : undefined}
          placeholder={t('crm.opportunities.amountPlaceholder')}
          onChange={(event) => setAmount(event.target.value)}
        />
      </FormField>
      <FormField label={t('crm.opportunities.stage')} htmlFor={stageId}>
        <Select
          id={stageId}
          value={stage}
          onValueChange={(value) => setStage(value as OpportunityStage)}
        >
          <SelectTrigger className='w-full'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPPORTUNITY_STAGES.map((option) => (
              <SelectItem key={option} value={option}>
                {t(`crm.stage.${option}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <FormActions
        submitting={submitting}
        onCancel={onCancel}
        submitLabel={t('crm.common.save')}
      />
    </form>
  );
}

export function StageBadge({ stage }: { readonly stage: OpportunityStage }) {
  const { t } = useTranslation();
  const tone =
    stage === 'won'
      ? 'border-primary/30 bg-primary/10 text-primary'
      : stage === 'lost'
        ? 'border-destructive/30 bg-destructive/10 text-destructive'
        : 'border-border bg-muted text-muted-foreground';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        tone,
      )}
    >
      {t(`crm.stage.${stage}`)}
    </span>
  );
}

export function DataTable({
  headers,
  children,
}: {
  readonly headers: readonly string[];
  readonly children: ReactNode;
}) {
  return (
    <div className='overflow-x-auto rounded-lg border border-border'>
      <table className='w-full border-collapse text-sm'>
        <thead className='bg-muted/50 text-left text-muted-foreground'>
          <tr>
            {headers.map((header) => (
              <th
                key={header}
                className='px-4 py-2 font-medium whitespace-nowrap'
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className='divide-y divide-border'>{children}</tbody>
      </table>
    </div>
  );
}

export function TableCell({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <td className={cn('px-4 py-2 align-middle', className)}>{children}</td>
  );
}

export function StatePanel({ children }: { readonly children: ReactNode }) {
  return (
    <div className='flex items-center justify-center rounded-lg border border-dashed border-border px-4 py-12 text-sm text-muted-foreground'>
      {children}
    </div>
  );
}
