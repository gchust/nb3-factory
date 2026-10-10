import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';

import type {
  InspectionResult,
  InspectionStatus,
  KnowledgeStatus,
  ManualStatus,
  OrderPriority,
  OrderStatus,
} from '@/api/service-types.js';

/**
 * The colour a business state carries across the application.
 *
 * The state is also written out, so colour is never the only signal. Anything
 * the current set does not know — a state a newer revision added — falls back
 * to the neutral style and its raw key, so an unknown value is visible instead
 * of silently styled as something it is not.
 */
type BadgeVariant =
  'default' | 'secondary' | 'destructive' | 'outline' | 'ghost';

const ORDER_STATUS_VARIANT: Readonly<Record<OrderStatus, BadgeVariant>> = {
  pending_acceptance: 'secondary',
  pending_processing: 'outline',
  processing: 'default',
  pending_confirmation: 'secondary',
  closed: 'ghost',
};

const ORDER_PRIORITY_VARIANT: Readonly<Record<OrderPriority, BadgeVariant>> = {
  low: 'ghost',
  normal: 'outline',
  high: 'secondary',
  urgent: 'destructive',
};

const INSPECTION_STATUS_VARIANT: Readonly<
  Record<InspectionStatus, BadgeVariant>
> = {
  pending: 'outline',
  completed: 'default',
  skipped: 'ghost',
};

const INSPECTION_RESULT_VARIANT: Readonly<
  Record<InspectionResult, BadgeVariant>
> = {
  normal: 'default',
  attention: 'secondary',
  fault: 'destructive',
};

const KNOWLEDGE_STATUS_VARIANT: Readonly<
  Record<KnowledgeStatus, BadgeVariant>
> = {
  draft: 'outline',
  published: 'default',
  archived: 'ghost',
};

const MANUAL_STATUS_VARIANT: Readonly<Record<ManualStatus, BadgeVariant>> = {
  uploaded: 'outline',
  processing: 'secondary',
  ready: 'default',
  failed: 'destructive',
};

/**
 * A state's wording, falling back to the raw value.
 *
 * `t` resolves an unknown key to the key itself, so a state the dictionaries do
 * not carry shows its value rather than an unreadable key or an empty badge.
 */
function useStateLabel(group: string, value: string): string {
  const { t } = useTranslation();
  const key = `service.${group}.${value}`;
  const translated = String(t(key));
  return translated === key ? value : translated;
}

export function OrderStatusBadge({
  status,
}: {
  readonly status: string;
}): ReactElement {
  const label = useStateLabel('orderStatus', status);
  return (
    <Badge variant={ORDER_STATUS_VARIANT[status as OrderStatus] ?? 'outline'}>
      {label}
    </Badge>
  );
}

export function OrderPriorityBadge({
  priority,
}: {
  readonly priority: string;
}): ReactElement {
  const label = useStateLabel('priority', priority);
  return (
    <Badge
      variant={ORDER_PRIORITY_VARIANT[priority as OrderPriority] ?? 'outline'}
    >
      {label}
    </Badge>
  );
}

export function InspectionStatusBadge({
  status,
}: {
  readonly status: string;
}): ReactElement {
  const label = useStateLabel('inspectionStatus', status);
  return (
    <Badge
      variant={
        INSPECTION_STATUS_VARIANT[status as InspectionStatus] ?? 'outline'
      }
    >
      {label}
    </Badge>
  );
}

export function InspectionResultBadge({
  result,
}: {
  readonly result: string;
}): ReactElement {
  const label = useStateLabel('inspectionResult', result);
  return (
    <Badge
      variant={
        INSPECTION_RESULT_VARIANT[result as InspectionResult] ?? 'outline'
      }
    >
      {label}
    </Badge>
  );
}

export function KnowledgeStatusBadge({
  status,
}: {
  readonly status: string;
}): ReactElement {
  const label = useStateLabel('knowledgeStatus', status);
  return (
    <Badge
      variant={KNOWLEDGE_STATUS_VARIANT[status as KnowledgeStatus] ?? 'outline'}
    >
      {label}
    </Badge>
  );
}

export function ManualStatusBadge({
  status,
}: {
  readonly status: string;
}): ReactElement {
  const label = useStateLabel('manualStatus', status);
  return (
    <Badge variant={MANUAL_STATUS_VARIANT[status as ManualStatus] ?? 'outline'}>
      {label}
    </Badge>
  );
}
