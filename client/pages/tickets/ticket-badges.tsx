import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';

/**
 * The status and category labels shared by the list and the detail drawer.
 *
 * They live in their own module so both surfaces agree on the wording and the
 * colour, and so neither has to repeat the status-to-variant mapping.
 */

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  pending: 'outline',
  processing: 'secondary',
  completed: 'default',
};

export function TicketStatusBadge({
  status,
}: {
  readonly status: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={STATUS_VARIANT[status] ?? 'outline'}>
      {t(`tickets.status.${status}`)}
    </Badge>
  );
}

export function TicketCategoryBadge({
  category,
}: {
  readonly category: string;
}): ReactElement {
  const { t } = useTranslation();
  return <Badge variant='ghost'>{t(`tickets.category.${category}`)}</Badge>;
}
