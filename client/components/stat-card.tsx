import type { ReactElement, ReactNode } from 'react';

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface StatCardProps {
  readonly label: ReactNode;
  readonly value: ReactNode;
  readonly hint?: ReactNode;
  readonly icon?: ReactNode;
  /** `destructive` is for a count the user must act on, such as overdue equipment. */
  readonly tone?: 'default' | 'destructive';
}

/**
 * A single summary number: a label, a large value, an optional icon and an optional hint line. Built on the theme
 * tokens so it follows the light and dark themes. Shared by the equipment and borrow-record list pages.
 */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
}: StatCardProps): ReactElement {
  const destructive = tone === 'destructive';
  return (
    <Card className={cn(destructive && 'border-destructive/40')}>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={cn(
            'font-heading text-2xl tabular-nums',
            destructive && 'text-destructive',
          )}
        >
          {value}
        </CardTitle>
        {icon ? (
          <CardAction
            className={cn(
              'text-muted-foreground',
              destructive && 'text-destructive',
            )}
          >
            {icon}
          </CardAction>
        ) : null}
      </CardHeader>
      {hint ? (
        <CardContent className='text-sm text-muted-foreground'>
          {hint}
        </CardContent>
      ) : null}
    </Card>
  );
}
