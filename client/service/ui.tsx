import { useTranslation } from '@nocobase/i18n/client';
import { SearchIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import { describeError } from './api.js';
import { asText } from './format.js';

type BadgeTone = 'default' | 'secondary' | 'destructive' | 'outline';

const TICKET_TONES: Record<string, BadgeTone> = {
  draft: 'outline',
  pending_assignment: 'secondary',
  in_progress: 'default',
  pending_confirmation: 'secondary',
  closed: 'outline',
  cancelled: 'destructive',
};

const PRIORITY_TONES: Record<string, BadgeTone> = {
  urgent: 'destructive',
  high: 'default',
  normal: 'secondary',
  low: 'outline',
};

const ARTICLE_TONES: Record<string, BadgeTone> = {
  published: 'default',
  draft: 'secondary',
};

const DEVICE_TONES: Record<string, BadgeTone> = {
  in_service: 'default',
  maintenance: 'secondary',
  retired: 'outline',
};

const INSPECTION_TONES: Record<string, BadgeTone> = {
  pending: 'secondary',
  in_progress: 'default',
  done: 'outline',
  skipped: 'outline',
};

const DELIVERY_TONES: Record<string, BadgeTone> = {
  sent: 'default',
  pending: 'secondary',
  failed: 'destructive',
  not_configured: 'outline',
};

const LEVEL_TONES: Record<string, BadgeTone> = {
  key: 'default',
  standard: 'secondary',
  basic: 'outline',
};

const TONES: Record<string, Record<string, BadgeTone>> = {
  ticket: TICKET_TONES,
  priority: PRIORITY_TONES,
  article: ARTICLE_TONES,
  device: DEVICE_TONES,
  inspection: INSPECTION_TONES,
  delivery: DELIVERY_TONES,
  level: LEVEL_TONES,
  customer: { active: 'default', inactive: 'outline' },
};

export interface StatusBadgeProps {
  readonly kind: string;
  readonly value: unknown;
}

/** A status, priority or level pill whose wording comes from the locale file. */
export function StatusBadge({ kind, value }: StatusBadgeProps): ReactElement {
  const { t } = useTranslation();
  const raw = asText(value);
  const tone = TONES[kind]?.[raw] ?? 'outline';
  const label = t(`service.status.${kind}.${raw}`, {
    defaultValue: raw || '—',
  });
  return <Badge variant={tone}>{label}</Badge>;
}

export interface RegionBadgeProps {
  readonly value: unknown;
}

export function RegionBadge({ value }: RegionBadgeProps): ReactElement {
  const { t } = useTranslation();
  const raw = asText(value);
  return (
    <Badge variant='outline'>
      {t(`service.region.${raw}`, { defaultValue: raw || '—' })}
    </Badge>
  );
}

export interface SectionCardProps {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}

export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
}: SectionCardProps): ReactElement {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {actions ? <CardAction>{actions}</CardAction> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export interface StatCardProps {
  readonly label: ReactNode;
  readonly value: ReactNode;
  readonly hint?: ReactNode;
  readonly tone?: BadgeTone;
}

export function StatCard({
  label,
  value,
  hint,
  tone,
}: StatCardProps): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className='text-3xl tabular-nums'>{value}</CardTitle>
        {hint ? (
          <CardAction>
            <Badge variant={tone ?? 'secondary'}>{hint}</Badge>
          </CardAction>
        ) : null}
      </CardHeader>
    </Card>
  );
}

export interface FieldRowProps {
  readonly label: ReactNode;
  readonly children: ReactNode;
}

export function FieldRow({ label, children }: FieldRowProps): ReactElement {
  return (
    <div className='flex flex-col gap-1'>
      <dt className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>
        {label}
      </dt>
      <dd className='text-sm break-words'>{children}</dd>
    </div>
  );
}

export interface InfoGridProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export function InfoGrid({ children, className }: InfoGridProps): ReactElement {
  return (
    <dl
      className={cn(
        'grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3',
        className,
      )}
    >
      {children}
    </dl>
  );
}

export interface SearchInputProps {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly placeholder?: string;
  readonly className?: string;
}

export function SearchInput({
  value,
  onValueChange,
  placeholder,
  className,
}: SearchInputProps): ReactElement {
  return (
    <div className={cn('relative w-full max-w-xs', className)}>
      <SearchIcon className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
      <Input
        value={value}
        placeholder={placeholder}
        className='pl-8'
        onChange={(event) => onValueChange(event.target.value)}
      />
    </div>
  );
}

export interface FilterSelectOption {
  readonly value: string;
  readonly label: string;
}

export interface FilterSelectProps {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly options: readonly FilterSelectOption[];
  readonly allLabel: string;
  readonly className?: string;
}

/** A select with an explicit "all" choice, used for every list filter. */
export function FilterSelect({
  value,
  onValueChange,
  options,
  allLabel,
  className,
}: FilterSelectProps): ReactElement {
  const items = [{ value: 'all', label: allLabel }, ...options];
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next: string | null) => onValueChange(next ?? 'all')}
    >
      <SelectTrigger size='sm' className={cn('min-w-32', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export interface ListPagerProps {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly onPageChange: (page: number) => void;
}

export function ListPager({
  page,
  pageSize,
  total,
  onPageChange,
}: ListPagerProps): ReactElement {
  const { t } = useTranslation();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className='flex flex-wrap items-center justify-between gap-3'>
      <p className='text-sm text-muted-foreground'>
        {t('service.common.pageSummary', { page, pageCount, total })}
      </p>
      <div className='flex items-center gap-2'>
        <Button
          variant='outline'
          size='sm'
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          {t('service.common.previous')}
        </Button>
        <Button
          variant='outline'
          size='sm'
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          {t('service.common.next')}
        </Button>
      </div>
    </div>
  );
}

export interface QueryStateProps {
  readonly loading: boolean;
  readonly error: unknown;
  readonly empty?: boolean;
  readonly onRetry?: () => void;
  readonly children: ReactNode;
  readonly skeletonRows?: number;
}

/**
 * The one place the three request outcomes are rendered: a skeleton while
 * loading, a retryable error, an empty notice, or the content itself.
 */
export function QueryState({
  loading,
  error,
  empty,
  onRetry,
  children,
  skeletonRows = 4,
}: QueryStateProps): ReactElement {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className='space-y-2'>
        {Array.from({ length: skeletonRows }, (_, index) => (
          <Skeleton key={index} className='h-10 w-full' />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <Alert variant='destructive'>
        <AlertTitle>{t('service.common.loadFailed')}</AlertTitle>
        <AlertDescription className='space-y-2'>
          <p>{describeError(error)}</p>
          {onRetry ? (
            <Button variant='outline' size='sm' onClick={onRetry}>
              {t('service.common.retry')}
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  }
  if (empty) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{t('service.common.empty')}</EmptyTitle>
          <EmptyDescription>{t('service.common.emptyHint')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return <>{children}</>;
}

export interface AlertNoticeProps {
  readonly title: ReactNode;
  readonly children: ReactNode;
  readonly variant?: 'default' | 'destructive';
}

export function AlertNotice({
  title,
  children,
  variant,
}: AlertNoticeProps): ReactElement {
  return (
    <Alert variant={variant}>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

export function Divider(): ReactElement {
  return <Separator className='my-4' />;
}
