/* eslint-disable @eslint-react/no-array-index-key -- a table's headers are a fixed positional list, so their position is their identity */
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** Small, shared presentation pieces so every sales page looks the same. */

const TONES: Record<string, string> = {
  neutral: 'bg-muted text-muted-foreground',
  info: 'bg-primary/10 text-primary',
  success: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  danger: 'bg-destructive/10 text-destructive',
};

export function Badge({
  tone = 'neutral',
  children,
}: {
  readonly tone?: string;
  readonly children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        TONES[tone] ?? TONES.neutral,
      )}
    >
      {children}
    </span>
  );
}

export function Field({
  label,
  children,
  className,
}: {
  readonly label: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cn('space-y-1', className)}>
      <div className='text-xs text-muted-foreground'>{label}</div>
      <div className='text-sm'>{children}</div>
    </div>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
}: {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section className='rounded-xl border border-border bg-background'>
      <header className='flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h2 className='font-heading text-base font-semibold'>{title}</h2>
          {description ? (
            <p className='mt-1 text-sm text-muted-foreground'>{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className='flex items-center gap-2'>{actions}</div>
        ) : null}
      </header>
      <div className='p-4'>{children}</div>
    </section>
  );
}

export function EmptyState({ children }: { readonly children: ReactNode }) {
  return (
    <p className='rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground'>
      {children}
    </p>
  );
}

export function ErrorNotice({ message }: { readonly message?: string }) {
  if (!message) return null;
  return (
    <p
      role='alert'
      className='rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'
    >
      {message}
    </p>
  );
}

export function DataTable({
  headers,
  children,
}: {
  readonly headers: readonly ReactNode[];
  readonly children: ReactNode;
}) {
  return (
    <div className='w-full overflow-x-auto'>
      <table className='w-full border-collapse text-sm'>
        <thead>
          <tr className='border-b border-border text-left text-xs text-muted-foreground'>
            {headers.map((header, index) => (
              <th
                key={index}
                className='px-3 py-2 font-medium whitespace-nowrap'
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function TextArea({
  className,
  ...props
}: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30',
        className,
      )}
      {...props}
    />
  );
}

/**
 * A native select, styled with the shared tokens.
 *
 * The UI needs a plain, keyboard- and automation-friendly control for status,
 * stage, channel and owner choices; a native element gives that without a
 * popup layer whose selection semantics vary between assistive tools.
 */
export function SelectInput({
  className,
  children,
  ...props
}: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
