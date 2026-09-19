import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement, ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { errorMessageKey } from './api.js';

export function Panel({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-background p-4 shadow-xs',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function StateNotice({
  loading,
  error,
  isEmpty,
  emptyKey,
  onRetry,
}: {
  readonly loading: boolean;
  readonly error: unknown;
  readonly isEmpty?: boolean;
  readonly emptyKey?: string;
  readonly onRetry?: () => void;
}): ReactElement | null {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div
        className='rounded-xl border border-border bg-muted/40 p-6 text-sm text-muted-foreground'
        role='status'
      >
        {t('recruitment.common.loading')}
      </div>
    );
  }
  if (error) {
    return (
      <div
        className='flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between'
        role='alert'
      >
        <span>{t(errorMessageKey(error))}</span>
        {onRetry ? (
          <button
            className='w-fit rounded-lg border border-destructive/40 px-3 py-1.5 font-medium hover:bg-destructive/10'
            onClick={onRetry}
            type='button'
          >
            {t('recruitment.common.retry')}
          </button>
        ) : null}
      </div>
    );
  }
  if (isEmpty && emptyKey) {
    return (
      <div className='rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground'>
        {t(emptyKey)}
      </div>
    );
  }
  return null;
}

export function Pill({
  tone = 'muted',
  children,
}: {
  readonly tone?:
    'muted' | 'secondary' | 'accent' | 'primary' | 'solid' | 'danger';
  readonly children: ReactNode;
}): ReactElement {
  const tones: Record<string, string> = {
    muted: 'bg-muted text-muted-foreground',
    secondary: 'bg-secondary text-secondary-foreground',
    accent: 'bg-accent text-accent-foreground',
    primary: 'bg-primary/15 text-primary',
    solid: 'bg-primary text-primary-foreground',
    danger: 'bg-destructive/10 text-destructive',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

const STAGE_TONES: Record<
  string,
  'muted' | 'secondary' | 'accent' | 'primary' | 'solid' | 'danger'
> = {
  pending: 'muted',
  interviewed: 'secondary',
  pending_offer: 'accent',
  offered: 'primary',
  onboarded: 'solid',
  rejected: 'danger',
};

export function StagePill({ stage }: { readonly stage: string }): ReactElement {
  const { t } = useTranslation();
  return (
    <Pill tone={STAGE_TONES[stage] ?? 'muted'}>
      {t(`recruitment.stages.${stage}`, { defaultValue: stage })}
    </Pill>
  );
}

export function InterviewStatusPill({
  status,
}: {
  readonly status: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Pill tone={status === 'completed' ? 'primary' : 'accent'}>
      {t(`recruitment.interviews.statuses.${status}`, { defaultValue: status })}
    </Pill>
  );
}

export function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <label className='flex flex-col gap-1.5 text-sm'>
      <span className='font-medium text-foreground'>{label}</span>
      {children}
    </label>
  );
}

export const inputClassName =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

export function NativeSelect({
  value,
  onChange,
  children,
  ariaLabel,
  disabled,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly children: ReactNode;
  readonly ariaLabel?: string;
  readonly disabled?: boolean;
}): ReactElement {
  return (
    <select
      aria-label={ariaLabel}
      className={cn(inputClassName, 'pr-8')}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      {children}
    </select>
  );
}

export function SummaryCard({
  label,
  value,
}: {
  readonly label: string;
  readonly value: ReactNode;
}): ReactElement {
  return (
    <div className='rounded-xl border border-border bg-background p-4 shadow-xs'>
      <p className='text-xs font-medium text-muted-foreground'>{label}</p>
      <p className='mt-1 text-2xl font-semibold tracking-tight'>{value}</p>
    </div>
  );
}

export function Bar({
  label,
  value,
  max,
  tone = 'bg-primary',
}: {
  readonly label: string;
  readonly value: number;
  readonly max: number;
  readonly tone?: string;
}): ReactElement {
  const width = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className='space-y-1'>
      <div className='flex items-center justify-between text-xs text-muted-foreground'>
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className='h-2 w-full overflow-hidden rounded-full bg-muted'>
        <div
          className={cn('h-full rounded-full', tone)}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

export function ErrorBanner({
  messageKey,
}: {
  readonly messageKey: string | undefined;
}): ReactElement | null {
  const { t } = useTranslation();
  if (!messageKey) return null;
  return (
    <div
      className='rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'
      role='alert'
    >
      {t(messageKey)}
    </div>
  );
}
