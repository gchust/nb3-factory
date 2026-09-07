import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';

const STATUS_VARIANTS: Readonly<
  Record<string, 'default' | 'secondary' | 'outline' | 'destructive'>
> = {
  available: 'default',
  inUse: 'secondary',
  maintenance: 'outline',
  retired: 'destructive',
};

export interface AssetStatusBadgeProps {
  readonly status: string;
  readonly label: string;
}

export function AssetStatusBadge({
  status,
  label,
}: AssetStatusBadgeProps): ReactElement {
  return (
    <Badge variant={STATUS_VARIANTS[status] ?? 'secondary'}>{label}</Badge>
  );
}

export interface RecordStatusBadgeProps {
  readonly status: string;
  readonly label: string;
}

export function RecordStatusBadge({
  status,
  label,
}: RecordStatusBadgeProps): ReactElement {
  return (
    <Badge variant={status === 'claimed' ? 'secondary' : 'outline'}>
      {label}
    </Badge>
  );
}
