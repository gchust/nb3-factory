import type { ComponentProps, ReactElement, ReactNode } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircle } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Loading } from '@/components/loading';
import {
  orderStatusKey,
  receiptStatusKey,
  supplierStatusKey,
} from './format.js';

export function Table({
  className,
  ...props
}: ComponentProps<'table'>): ReactElement {
  return (
    <div className='w-full overflow-x-auto rounded-lg border border-border'>
      <table
        className={cn('w-full caption-bottom text-sm', className)}
        {...props}
      />
    </div>
  );
}

export function THead({ children }: { children: ReactNode }): ReactElement {
  return (
    <thead className='bg-muted/50'>
      <tr className='border-b border-border'>{children}</tr>
    </thead>
  );
}

export function TH({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}): ReactElement {
  return (
    <th
      className={cn(
        'px-3 py-2 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground',
        className,
      )}
      scope='col'
    >
      {children}
    </th>
  );
}

export function TR({
  className,
  ...props
}: ComponentProps<'tr'>): ReactElement {
  return (
    <tr
      className={cn('border-b border-border last:border-0', className)}
      {...props}
    />
  );
}

export function TD({
  className,
  ...props
}: ComponentProps<'td'>): ReactElement {
  return (
    <td
      className={cn('px-3 py-2 align-middle whitespace-nowrap', className)}
      {...props}
    />
  );
}

export function Field({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <div className={cn('space-y-1.5', className)}>
      <span className='text-sm font-medium'>{label}</span>
      {children}
    </div>
  );
}

export function ErrorBanner({
  message,
}: {
  message: string | null;
}): ReactElement | null {
  if (!message) return null;
  return (
    <div
      className='flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'
      role='alert'
    >
      <AlertCircle aria-hidden='true' className='mt-0.5 size-4 shrink-0' />
      <span>{message}</span>
    </div>
  );
}

export function EmptyState({ message }: { message: string }): ReactElement {
  return (
    <div className='rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground'>
      {message}
    </div>
  );
}

export function TableState({
  loading,
  empty,
  hasRows,
}: {
  loading: boolean;
  empty: string;
  hasRows: boolean;
}): ReactElement | null {
  if (loading) {
    return (
      <div className='py-8'>
        <Loading />
      </div>
    );
  }
  if (!hasRows) return <EmptyState message={empty} />;
  return null;
}

const ORDER_VARIANTS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-secondary text-secondary-foreground',
  approved: 'bg-primary/10 text-primary',
  rejected: 'bg-destructive/10 text-destructive',
};

const RECEIPT_VARIANTS: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground',
  partial: 'bg-secondary text-secondary-foreground',
  received: 'bg-primary/10 text-primary',
};

const SUPPLIER_VARIANTS: Record<string, string> = {
  active: 'bg-primary/10 text-primary',
  inactive: 'bg-muted text-muted-foreground',
};

function Badge({
  variant,
  children,
}: {
  variant: string;
  children: ReactNode;
}): ReactElement {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap',
        variant,
      )}
    >
      {children}
    </span>
  );
}

export function OrderStatusBadge({ status }: { status: string }): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={ORDER_VARIANTS[status] ?? ORDER_VARIANTS.draft}>
      {t(orderStatusKey(status))}
    </Badge>
  );
}

export function ReceiptStatusBadge({
  status,
}: {
  status: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={RECEIPT_VARIANTS[status] ?? RECEIPT_VARIANTS.pending}>
      {t(receiptStatusKey(status))}
    </Badge>
  );
}

export function SupplierStatusBadge({
  status,
}: {
  status: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={SUPPLIER_VARIANTS[status] ?? SUPPLIER_VARIANTS.active}>
      {t(supplierStatusKey(status))}
    </Badge>
  );
}
