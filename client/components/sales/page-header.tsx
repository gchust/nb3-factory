import type { ReactNode } from 'react';

export interface PageHeaderProps {
  readonly title: string;
  readonly description?: string;
  readonly actions?: ReactNode;
}

export function PageHeader({
  title,
  description,
  actions,
}: PageHeaderProps): ReactNode {
  return (
    <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
      <div className='space-y-1'>
        <h1 className='text-2xl font-semibold tracking-tight'>{title}</h1>
        {description ? (
          <p className='text-sm text-muted-foreground'>{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className='flex flex-wrap items-center gap-2'>{actions}</div>
      ) : null}
    </div>
  );
}
