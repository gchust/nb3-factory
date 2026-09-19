import { useTranslation } from '@nocobase/i18n/client';
import { LoaderCircle } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useRouteOverlay } from '@/components/use-route-overlay';
import type { Tone } from './lib';

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  info: 'bg-primary/10 text-primary',
  success: 'bg-chart-2/15 text-chart-2',
  warning: 'bg-chart-4/20 text-chart-4',
  danger: 'bg-destructive/10 text-destructive',
};

export function StatusBadge({
  tone,
  children,
}: {
  readonly tone: Tone;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        TONE_CLASS[tone],
      )}
    >
      {children}
    </span>
  );
}

export function LoadingBlock({
  label,
}: {
  readonly label: string;
}): ReactElement {
  return (
    <div className='flex items-center justify-center gap-2 rounded-xl border border-border bg-card p-10 text-sm text-muted-foreground'>
      <LoaderCircle aria-hidden='true' className='size-4 animate-spin' />
      <span>{label}</span>
    </div>
  );
}

export function ErrorBlock({
  message,
  onRetry,
  retryLabel,
}: {
  readonly message: string;
  readonly onRetry?: () => void;
  readonly retryLabel?: string;
}): ReactElement {
  return (
    <div
      role='alert'
      className='flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive'
    >
      <span>{message}</span>
      {onRetry ? (
        <button
          type='button'
          className='rounded-md border border-destructive/40 px-2.5 py-1 font-medium hover:bg-destructive/10'
          onClick={onRetry}
        >
          {retryLabel ?? 'Retry'}
        </button>
      ) : null}
    </div>
  );
}

export function EmptyBlock({
  message,
}: {
  readonly message: string;
}): ReactElement {
  return (
    <div className='rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground'>
      {message}
    </div>
  );
}

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export function SimpleSelect({
  value,
  onValueChange,
  options,
  placeholder,
  ariaLabel,
  className,
}: {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly options: readonly SelectOption[];
  readonly placeholder?: string;
  readonly ariaLabel: string;
  readonly className?: string;
}): ReactElement {
  return (
    <Select
      items={options}
      value={value}
      onValueChange={(next) => onValueChange(String(next))}
    >
      <SelectTrigger aria-label={ariaLabel} className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Inline, field-scoped validation message. It carries `role="alert"` so the
 * prompt is announced and discoverable in the DOM, which is what makes a
 * rejected submission visible instead of silently doing nothing.
 */
export function FieldError({
  children,
}: {
  readonly children?: string;
}): ReactElement | null {
  if (!children) return null;
  return (
    <p role='alert' className='text-xs font-medium text-destructive'>
      {children}
    </p>
  );
}

export function Field({
  label,
  htmlFor,
  error,
  required = false,
  children,
}: {
  readonly label: string;
  readonly htmlFor?: string;
  readonly error?: string;
  readonly required?: boolean;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className='space-y-1.5'>
      <label className='text-sm font-medium' htmlFor={htmlFor}>
        {label}
        {required ? (
          <span aria-hidden='true' className='ml-0.5 text-destructive'>
            *
          </span>
        ) : null}
      </label>
      {children}
      <FieldError>{error}</FieldError>
    </div>
  );
}

export function DialogActions({
  formId,
  busy = false,
  submitLabel,
  cancelLabel,
}: {
  readonly formId?: string;
  readonly busy?: boolean;
  readonly submitLabel?: string;
  readonly cancelLabel?: string;
}): ReactElement {
  const { t } = useTranslation();
  const { close, isClosing } = useRouteOverlay();
  return (
    <>
      <Button
        type='button'
        variant='outline'
        disabled={busy || isClosing}
        onClick={() => {
          void close().catch((error: unknown) => {
            console.error('Failed to close route overlay', error);
          });
        }}
      >
        {cancelLabel ?? t('actions.cancel')}
      </Button>
      <Button type='submit' form={formId} disabled={busy || isClosing}>
        {submitLabel ?? t('actions.confirm')}
      </Button>
    </>
  );
}
