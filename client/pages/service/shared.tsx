import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, type ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';

import { useErrorMessage } from './service-api.js';

export interface ErrorStateProps {
  readonly error: unknown;
  readonly onRetry?: () => void;
}

export function ErrorState({ error, onRetry }: ErrorStateProps): ReactElement {
  const { t } = useTranslation();
  const message = useErrorMessage();
  return (
    <div className='flex flex-col items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4'>
      <p className='text-sm text-destructive'>{message(error)}</p>
      {onRetry ? (
        <Button variant='outline' size='sm' onClick={onRetry}>
          {t('service.action.retry')}
        </Button>
      ) : null}
    </div>
  );
}

export function LoadingState(): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='flex items-center gap-2 p-6 text-sm text-muted-foreground'>
      <Spinner />
      {t('status.loading')}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
}): ReactElement {
  return (
    <div className='flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center'>
      <p className='font-medium'>{title}</p>
      {description ? (
        <p className='max-w-md text-sm text-muted-foreground'>{description}</p>
      ) : null}
      {action}
    </div>
  );
}

export function PageSection({
  title,
  description,
  action,
  children,
}: {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Card>
      <CardHeader className='flex-row items-start justify-between gap-4'>
        <div className='min-w-0'>
          <CardTitle className='text-base'>{title}</CardTitle>
          {description ? (
            <p className='mt-1 text-sm text-muted-foreground'>{description}</p>
          ) : null}
        </div>
        {action ? <div className='shrink-0'>{action}</div> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

/** A labelled dropdown bound to a string value; `''` stands for “none”. */
export function SelectField({
  value,
  onValueChange,
  placeholder,
  options,
  className,
  id,
}: {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly placeholder?: string;
  readonly options: readonly SelectOption[];
  readonly className?: string;
  readonly id?: string;
}): ReactElement {
  return (
    <Select value={value} onValueChange={(next) => onValueChange(next ?? '')}>
      <SelectTrigger id={id} className={className ?? 'w-full'}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const STATUS_VARIANT: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pendingAcceptance: 'outline',
  pending: 'secondary',
  processing: 'default',
  pendingConfirmation: 'secondary',
  closed: 'outline',
  done: 'default',
  issue: 'destructive',
  ready: 'default',
  unconfigured: 'outline',
  failed: 'destructive',
};

export function StatusBadge({
  status,
}: {
  readonly status: string;
}): ReactElement {
  const { t } = useTranslation();
  const key = `service.status.${status}`;
  const label = t(key);
  return (
    <Badge variant={STATUS_VARIANT[status] ?? 'outline'}>
      {label === key ? status : label}
    </Badge>
  );
}
