import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';
import { statusLabel } from '@/lib/status-labels';

const CONTRACT_TONES: Readonly<Record<string, string>> = {
  draft: 'bg-muted text-muted-foreground',
  active: 'bg-primary/10 text-primary',
  performing: 'bg-primary/10 text-primary',
  completed: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  terminated: 'bg-destructive/10 text-destructive',
};

const MILESTONE_TONES: Readonly<Record<string, string>> = {
  pending: 'bg-muted text-muted-foreground',
  in_progress: 'bg-primary/10 text-primary',
  delivered: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  accepted: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
};

const VERSION_TONES: Readonly<Record<string, string>> = {
  pending_review: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  approved: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  returned: 'bg-destructive/10 text-destructive',
  withdrawn: 'bg-muted text-muted-foreground',
};

const RECEIVABLE_TONES: Readonly<Record<string, string>> = {
  unpaid: 'bg-destructive/10 text-destructive',
  partial: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  paid: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
};

export type StatusKind = 'contract' | 'milestone' | 'version' | 'receivable';

const TONES: Readonly<Record<StatusKind, Readonly<Record<string, string>>>> = {
  contract: CONTRACT_TONES,
  milestone: MILESTONE_TONES,
  version: VERSION_TONES,
  receivable: RECEIVABLE_TONES,
};

export function StatusBadge({
  kind,
  status,
}: {
  readonly kind: StatusKind;
  readonly status: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant='secondary' className={TONES[kind][status] ?? ''}>
      {statusLabel(t, kind, status)}
    </Badge>
  );
}
