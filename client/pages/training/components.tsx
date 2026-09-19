import { useTranslation } from '@nocobase/i18n/client';
import { Loader2, RotateCcw } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type StatusTone = 'success' | 'muted' | 'warning' | 'danger';

const TONE_CLASSES: Record<StatusTone, string> = {
  success: 'border-transparent bg-primary/10 text-primary',
  muted: 'border-border bg-muted text-muted-foreground',
  warning: 'border-transparent bg-accent text-accent-foreground',
  danger: 'border-transparent bg-destructive/10 text-destructive',
};

export function StatusBadge({
  label,
  tone = 'muted',
}: {
  readonly label: string;
  readonly tone?: StatusTone;
}): ReactElement {
  return (
    <Badge variant='outline' className={cn(TONE_CLASSES[tone])}>
      {label}
    </Badge>
  );
}

export function StatusFor({
  labelKey,
  tone,
  values,
}: {
  readonly labelKey: string;
  readonly tone: StatusTone;
  readonly values?: Record<string, string | number>;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <StatusBadge
      label={t(labelKey, { ...values, defaultValue: labelKey })}
      tone={tone}
    />
  );
}

export function LoadingBlock(): ReactElement {
  const { t } = useTranslation();
  return (
    <div
      className='flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground'
      role='status'
    >
      <Loader2 className='size-4 animate-spin' aria-hidden />
      {t('status.loading', { defaultValue: 'Loading' })}
    </div>
  );
}

export function ErrorBlock({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry?: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div
      className='flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm'
      role='alert'
    >
      <p className='text-destructive'>{message}</p>
      {onRetry ? (
        <Button variant='outline' size='sm' onClick={onRetry}>
          <RotateCcw className='size-4' aria-hidden />
          {t('status.retry', { defaultValue: 'Retry' })}
        </Button>
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
    <div className='rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground'>
      {message}
    </div>
  );
}

export function DeniedBlock({
  message,
}: {
  readonly message: string;
}): ReactElement {
  return (
    <div
      className='rounded-lg border border-border bg-muted/40 p-8 text-center text-sm text-muted-foreground'
      role='alert'
    >
      {message}
    </div>
  );
}

export function SectionCard({
  title,
  description,
  actions,
  children,
}: {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section className='space-y-4 rounded-xl border border-border bg-card p-5'>
      <header className='flex flex-wrap items-start justify-between gap-3'>
        <div className='space-y-1'>
          <h2 className='font-heading text-lg font-medium'>{title}</h2>
          {description ? (
            <p className='text-sm text-muted-foreground'>{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className='flex items-center gap-2'>{actions}</div>
        ) : null}
      </header>
      {children}
    </section>
  );
}
