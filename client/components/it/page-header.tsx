import type { ReactElement, ReactNode } from 'react';

/** Consistent page title block used by every IT page. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  readonly title: string;
  readonly description?: string;
  readonly actions?: ReactNode;
}): ReactElement {
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
      {actions ? (
        <div className='flex items-center gap-2'>{actions}</div>
      ) : null}
    </header>
  );
}
