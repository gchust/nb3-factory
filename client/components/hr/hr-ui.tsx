import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement, type ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

import { HrApiError } from './hr-api.js';

export function HrPage({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}): ReactElement {
  return (
    <section className='mx-auto w-full max-w-6xl space-y-6 p-6'>
      <header className='flex flex-wrap items-start justify-between gap-3'>
        <div className='space-y-1'>
          <h1 className='font-heading text-2xl font-semibold tracking-tight'>
            {title}
          </h1>
          {description ? (
            <p className='text-sm text-muted-foreground'>{description}</p>
          ) : null}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function SectionCard({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}): ReactElement {
  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between gap-3'>
        <CardTitle>{title}</CardTitle>
        {actions}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
}): ReactElement {
  return (
    <div className='space-y-1.5'>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className='text-xs text-muted-foreground'>{hint}</p> : null}
    </div>
  );
}

export function NativeSelect({
  className,
  ...props
}: React.ComponentProps<'select'>): ReactElement {
  return (
    <select
      data-slot='native-select'
      className={cn(
        'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30',
        className,
      )}
      {...props}
    />
  );
}

const STATUS_VARIANT: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending: 'secondary',
  approved: 'default',
  rejected: 'destructive',
};

export function StatusBadge({ status }: { status: string }): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={STATUS_VARIANT[status] ?? 'outline'}>
      {t(`hr.status.${status}`, { defaultValue: status })}
    </Badge>
  );
}

export function ErrorBanner({
  error,
}: {
  error: HrApiError | null | undefined;
}): ReactElement | null {
  const { t } = useTranslation();
  if (!error) return null;
  const key = error.code ? `hr.errors.${error.code}` : '';
  const message = key
    ? t(key, {
        ...(error.details as Record<string, string | number>),
        defaultValue: error.message,
      })
    : error.message;
  return (
    <div
      role='alert'
      className='rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'
    >
      {message}
    </div>
  );
}

export function SuccessBanner({
  message,
}: {
  message: string | null;
}): ReactElement | null {
  if (!message) return null;
  return (
    <div
      role='status'
      className='rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-foreground'
    >
      {message}
    </div>
  );
}

export function LoadingBlock(): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='flex items-center gap-2 py-6 text-sm text-muted-foreground'>
      <Spinner />
      {t('hr.common.loading', { defaultValue: 'Loading…' })}
    </div>
  );
}

export function EmptyBlock({ label }: { label: string }): ReactElement {
  return (
    <p className='py-6 text-center text-sm text-muted-foreground'>{label}</p>
  );
}

export function SubmitButton({
  busy,
  children,
}: {
  busy: boolean;
  children: ReactNode;
}): ReactElement {
  return (
    <Button type='submit' disabled={busy}>
      {busy ? <Spinner /> : null}
      {children}
    </Button>
  );
}

export function TableShell({
  head,
  children,
}: {
  head: readonly string[];
  children: ReactNode;
}): ReactElement {
  return (
    <div className='relative w-full overflow-x-auto rounded-lg border border-border'>
      <table className='w-full caption-bottom text-sm'>
        <thead className='bg-muted/50'>
          <tr className='border-b border-border'>
            {head.map((cell) => (
              <th
                key={cell}
                className='h-10 px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground'
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Td({
  className,
  ...props
}: React.ComponentProps<'td'>): ReactElement {
  return (
    <td
      className={cn('px-3 py-2 align-middle whitespace-nowrap', className)}
      {...props}
    />
  );
}

export function DecisionControls({
  busy,
  onDecide,
}: {
  busy: boolean;
  onDecide: (status: 'approved' | 'rejected', comment: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  const [comment, setComment] = useState('');
  return (
    <div className='flex min-w-72 items-center gap-2'>
      <Input
        aria-label={t('hr.approval.comment', {
          defaultValue: 'Approval comment',
        })}
        placeholder={t('hr.approval.commentPlaceholder', {
          defaultValue: 'Approval comment',
        })}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
      />
      <Button
        type='button'
        size='sm'
        disabled={busy}
        onClick={() => onDecide('approved', comment)}
      >
        {t('hr.approval.approve', { defaultValue: 'Approve' })}
      </Button>
      <Button
        type='button'
        size='sm'
        variant='destructive'
        disabled={busy}
        onClick={() => {
          onDecide('rejected', comment);
          setComment('');
        }}
      >
        {t('hr.approval.reject', { defaultValue: 'Reject' })}
      </Button>
    </div>
  );
}
