import { useTranslation } from '@nocobase/i18n/client';
import { Loader2 } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import {
  STAGE_TONES,
  STATUS_TONES,
  type BadgeTone,
} from '@/lib/recruiting-hooks';
import { cn } from '@/lib/utils';

export function PageHeader({
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
      {actions ? <div className='flex gap-2'>{actions}</div> : null}
    </header>
  );
}

export function PageSection({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <section className='space-y-4 p-6'>
      <div className={cn('mx-auto w-full max-w-6xl space-y-6', className)}>
        {children}
      </div>
    </section>
  );
}

export function Panel({
  title,
  actions,
  children,
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
}): ReactElement {
  return (
    <div className='overflow-hidden rounded-xl border border-border bg-card text-card-foreground'>
      {title || actions ? (
        <div className='flex items-center justify-between gap-3 border-b border-border px-4 py-3'>
          {title ? (
            <h2 className='font-heading text-sm font-medium'>{title}</h2>
          ) : (
            <span />
          )}
          {actions}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function Field({
  label,
  children,
  htmlFor,
}: {
  label: string;
  children: ReactNode;
  htmlFor?: string;
}): ReactElement {
  return (
    <label className='grid gap-1.5 text-sm' htmlFor={htmlFor}>
      <span className='font-medium text-foreground'>{label}</span>
      {children}
    </label>
  );
}

export function LoadingState({ label }: { label?: string }): ReactElement {
  return (
    <div className='flex items-center gap-2 p-6 text-sm text-muted-foreground'>
      <Loader2 className='size-4 animate-spin' aria-hidden />
      <span>{label ?? 'Loading…'}</span>
    </div>
  );
}

export function EmptyState({ label }: { label: string }): ReactElement {
  return (
    <p className='p-6 text-center text-sm text-muted-foreground'>{label}</p>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='flex flex-col items-start gap-2 p-6 text-sm'>
      <p className='text-destructive'>{message}</p>
      {onRetry ? (
        <button
          type='button'
          onClick={onRetry}
          className='text-sm font-medium text-primary underline-offset-4 hover:underline'
        >
          {t('recruiting.actions.retry')}
        </button>
      ) : null}
    </div>
  );
}

export function StatusBadge({
  label,
  tone = 'secondary',
}: {
  label: string;
  tone?: BadgeTone;
}): ReactElement {
  const variant: 'default' | 'secondary' | 'destructive' | 'outline' =
    tone === 'success' ? 'secondary' : tone;
  return (
    <Badge
      variant={variant}
      className={tone === 'success' ? 'bg-primary/10 text-primary' : undefined}
    >
      {label}
    </Badge>
  );
}

export function EnumBadge({
  kind,
  value,
}: {
  kind: string;
  value: string;
}): ReactElement {
  const { t } = useTranslation();
  const label = t(`recruiting.enums.${kind}.${value}`, {
    defaultValue: value,
  });
  const tone =
    kind === 'stage'
      ? (STAGE_TONES[value] ?? 'secondary')
      : (STATUS_TONES[value] ?? 'secondary');
  return <StatusBadge label={label} tone={tone} />;
}
