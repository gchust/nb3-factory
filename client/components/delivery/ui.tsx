import { useTranslation } from '@nocobase/i18n/client';
import { Loader2 } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import { errorText } from './errors.js';

export function DeliveryHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}): ReactElement {
  return (
    <header className='flex flex-wrap items-start justify-between gap-4'>
      <div className='space-y-1'>
        <h1 className='font-heading text-2xl font-semibold tracking-tight'>
          {title}
        </h1>
        {description ? (
          <p className='text-sm text-muted-foreground'>{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className='flex flex-wrap items-center gap-2'>{actions}</div>
      ) : null}
    </header>
  );
}

export function DeliveryError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const message = errorText(t, error);
  return (
    <div
      role='alert'
      className='flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive'
    >
      <span>{message}</span>
      {onRetry ? (
        <Button variant='outline' size='sm' onClick={onRetry}>
          {t('delivery.actions.retry')}
        </Button>
      ) : null}
    </div>
  );
}

export function DeliveryLoading(): ReactElement {
  const { t } = useTranslation();
  return (
    <div
      className='flex items-center gap-2 py-8 text-sm text-muted-foreground'
      role='status'
    >
      <Loader2 aria-hidden='true' className='size-4 animate-spin' />
      {t('delivery.loading')}
    </div>
  );
}

export function DeliveryEmpty({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return (
    <p className='py-8 text-center text-sm text-muted-foreground'>{children}</p>
  );
}

export function StatusBadge({
  value,
  tone,
}: {
  value: string;
  tone: string;
}): ReactElement {
  return <Badge variant={badgeVariant(tone)}>{value}</Badge>;
}

function badgeVariant(
  tone: string,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (tone) {
    case 'positive':
      return 'default';
    case 'warning':
      return 'destructive';
    case 'info':
      return 'secondary';
    default:
      return 'outline';
  }
}

export function FormField({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div className='space-y-2'>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

export function FormInput({
  id,
  label,
  value,
  onChange,
  type = 'text',
  required,
  step,
  min,
  max,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  step?: string;
  min?: string;
  max?: string;
  placeholder?: string;
}): ReactElement {
  return (
    <FormField id={id} label={label}>
      <Input
        id={id}
        type={type}
        value={value}
        required={required}
        step={step}
        min={min}
        max={max}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </FormField>
  );
}

export function FormTextarea({
  id,
  label,
  value,
  onChange,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}): ReactElement {
  return (
    <FormField id={id} label={label}>
      <Textarea
        id={id}
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
      />
    </FormField>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * A native select. It keeps keyboard and screen-reader behaviour from the
 * browser and is styled with the application's semantic tokens.
 */
export function FormSelect({
  id,
  label,
  value,
  onChange,
  options,
  emptyLabel,
  disabled,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  emptyLabel?: string;
  disabled?: boolean;
  required?: boolean;
}): ReactElement {
  return (
    <FormField id={id} label={label}>
      <select
        id={id}
        value={value}
        disabled={disabled}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'flex h-8 w-full items-center rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none',
          'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
          'disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30',
        )}
      >
        {emptyLabel !== undefined ? (
          <option value=''>{emptyLabel}</option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FormField>
  );
}
