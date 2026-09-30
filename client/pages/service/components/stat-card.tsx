import type { ReactElement, ReactNode } from 'react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface StatCardProps {
  readonly label: ReactNode;
  readonly value: ReactNode;
  readonly description?: ReactNode;
  /** Draws attention to a count that needs action, such as overdue work. */
  readonly tone?: 'default' | 'warning' | 'danger' | 'positive';
  readonly icon?: ReactNode;
}

const TONE_CLASS: Record<
  NonNullable<StatCardProps['tone']>,
  { readonly value: string; readonly icon: string }
> = {
  default: { value: 'text-foreground', icon: 'bg-muted text-muted-foreground' },
  warning: {
    value: 'text-foreground',
    icon: 'bg-secondary text-secondary-foreground',
  },
  danger: {
    value: 'text-destructive',
    icon: 'bg-destructive/10 text-destructive',
  },
  positive: {
    value: 'text-foreground',
    icon: 'bg-primary/10 text-primary',
  },
};

/** One headline number with its label, used across the dashboard. */
export function StatCard({
  label,
  value,
  description,
  tone = 'default',
  icon,
}: StatCardProps): ReactElement {
  const toneClass = TONE_CLASS[tone];
  return (
    <Card className='gap-3 py-5'>
      <CardHeader className='gap-1'>
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={cn('font-heading text-3xl tabular-nums', toneClass.value)}
        >
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent className='flex items-center gap-2 text-xs text-muted-foreground'>
        {icon ? (
          <span
            className={cn(
              'flex size-6 shrink-0 items-center justify-center rounded-md [&_svg]:size-3.5',
              toneClass.icon,
            )}
          >
            {icon}
          </span>
        ) : null}
        {description ? <span>{description}</span> : null}
      </CardContent>
    </Card>
  );
}
