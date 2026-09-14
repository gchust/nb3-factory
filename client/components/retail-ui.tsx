import type { ReactElement, ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  readonly title: string;
  readonly description?: string;
  readonly actions?: ReactNode;
}

export function PageHeader({
  title,
  description,
  actions,
}: PageHeaderProps): ReactElement {
  return (
    <header className='flex flex-wrap items-end justify-between gap-4'>
      <div className='space-y-1'>
        <h1 className='font-heading text-2xl font-semibold tracking-tight'>
          {title}
        </h1>
        {description ? (
          <p className='text-sm text-muted-foreground'>{description}</p>
        ) : null}
      </div>
      {actions ? <div className='flex gap-2'>{actions}</div> : null}
    </header>
  );
}

export interface PanelProps {
  readonly title?: string;
  readonly actions?: ReactNode;
  readonly className?: string;
  readonly children: ReactNode;
}

export function Panel({
  title,
  actions,
  className,
  children,
}: PanelProps): ReactElement {
  return (
    <section
      className={cn(
        'rounded-xl border border-border bg-card text-card-foreground shadow-sm',
        className,
      )}
    >
      {title || actions ? (
        <header className='flex items-center justify-between gap-3 border-b border-border px-4 py-3'>
          {title ? (
            <h2 className='text-sm font-semibold'>{title}</h2>
          ) : (
            <span />
          )}
          {actions ? <div className='flex gap-2'>{actions}</div> : null}
        </header>
      ) : null}
      <div className='p-4'>{children}</div>
    </section>
  );
}

export interface FieldProps {
  readonly label: string;
  readonly htmlFor?: string;
  readonly children: ReactNode;
}

export function Field({ label, htmlFor, children }: FieldProps): ReactElement {
  return (
    <div className='space-y-1.5'>
      <label
        className='text-xs font-medium text-muted-foreground'
        htmlFor={htmlFor}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

export interface BannerProps {
  readonly tone?: 'error' | 'success' | 'info';
  readonly children: ReactNode;
}

export function Banner({ tone = 'info', children }: BannerProps): ReactElement {
  const tones: Record<NonNullable<BannerProps['tone']>, string> = {
    error: 'border-destructive/40 bg-destructive/10 text-destructive',
    success: 'border-primary/40 bg-primary/10 text-foreground',
    info: 'border-border bg-muted text-foreground',
  };
  return (
    <div
      className={cn('rounded-lg border px-3 py-2 text-sm', tones[tone])}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {children}
    </div>
  );
}

export function EmptyState({ message }: { message: string }): ReactElement {
  return (
    <p className='py-8 text-center text-sm text-muted-foreground'>{message}</p>
  );
}

export function Money({ value }: { value: number }): ReactElement {
  return <span className='tabular-nums'>{value.toFixed(2)}</span>;
}
