import type { ReactElement } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function StatCard({
  label,
  value,
  hint,
  tone,
  className,
}: {
  readonly label: string;
  readonly value: number | string;
  readonly hint?: string;
  readonly tone?: 'default' | 'warn' | 'danger';
  readonly className?: string;
}): ReactElement {
  return (
    <Card className={cn('gap-1 py-4', className)}>
      <CardHeader className='px-4'>
        <CardTitle className='text-sm font-medium text-muted-foreground'>
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className='px-4'>
        <p
          className={cn(
            'font-heading text-3xl font-semibold tracking-tight',
            tone === 'danger' && 'text-destructive',
            tone === 'warn' && 'text-primary',
          )}
        >
          {value}
        </p>
        {hint ? (
          <p className='mt-1 text-xs text-muted-foreground'>{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
