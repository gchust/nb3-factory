import { useTranslation } from '@nocobase/i18n/client';
import { type ReactNode } from 'react';

import { cn } from '@/lib/utils';

import type { ExpenseStatus } from './api.js';

const STATUS_CLASS: Record<ExpenseStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-accent text-accent-foreground',
  approved: 'bg-primary/10 text-primary ring-1 ring-primary/20',
  rejected: 'bg-destructive/10 text-destructive ring-1 ring-destructive/20',
  paid: 'bg-secondary text-secondary-foreground ring-1 ring-border',
};

export function StatusBadge({
  status,
  className,
}: {
  readonly status: ExpenseStatus;
  readonly className?: string;
}) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        STATUS_CLASS[status],
        className,
      )}
    >
      {t(`expenses.status.${status}`)}
    </span>
  );
}

export function Notice({
  tone = 'info',
  children,
  className,
}: {
  readonly tone?: 'info' | 'warning' | 'error' | 'success';
  readonly children: ReactNode;
  readonly className?: string;
}) {
  const toneClass = {
    info: 'border-border bg-muted/50 text-muted-foreground',
    warning: 'border-border bg-accent text-accent-foreground',
    error: 'border-destructive/30 bg-destructive/10 text-destructive',
    success: 'border-primary/30 bg-primary/10 text-primary',
  }[tone];
  return (
    <div
      className={cn(
        'rounded-lg border px-4 py-3 text-sm leading-6',
        toneClass,
        className,
      )}
      role={tone === 'error' ? 'alert' : undefined}
    >
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
}) {
  return (
    <div className='flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center'>
      <p className='font-medium'>{title}</p>
      {description ? (
        <p className='max-w-md text-sm text-muted-foreground'>{description}</p>
      ) : null}
      {action}
    </div>
  );
}

export function Panel({
  title,
  actions,
  children,
  className,
}: {
  readonly title?: ReactNode;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <section
      className={cn(
        'rounded-xl border border-border bg-card text-card-foreground',
        className,
      )}
    >
      {title || actions ? (
        <header className='flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3'>
          {title ? (
            <h2 className='font-heading text-base'>{title}</h2>
          ) : (
            <span />
          )}
          {actions ? (
            <div className='flex items-center gap-2'>{actions}</div>
          ) : null}
        </header>
      ) : null}
      <div className='p-4'>{children}</div>
    </section>
  );
}

export function Field({
  label,
  children,
}: {
  readonly label: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div className='space-y-1'>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <div className='text-sm'>{children}</div>
    </div>
  );
}
