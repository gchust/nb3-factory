import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';

import {
  isItTicketCategory,
  isItTicketStatus,
  IT_CATEGORY_LABEL_KEYS,
  IT_STATUS_LABEL_KEYS,
} from './types.js';

// The workflow status doubles as the severity signal: a pending ticket needs
// attention, a processing one is being worked on, a completed one is done.
const STATUS_VARIANTS = {
  pending: 'outline',
  processing: 'secondary',
  completed: 'default',
} as const;

/** The ticket status as a badge; an unknown value falls back to plain text. */
export function ItTicketStatusBadge({
  status,
}: {
  readonly status: string;
}): ReactElement {
  const { t } = useTranslation();
  if (!isItTicketStatus(status)) {
    return <Badge variant='outline'>{status}</Badge>;
  }
  return (
    <Badge variant={STATUS_VARIANTS[status]}>
      {t(IT_STATUS_LABEL_KEYS[status])}
    </Badge>
  );
}

/** The ticket category as a badge; an unknown value falls back to plain text. */
export function ItTicketCategoryBadge({
  category,
}: {
  readonly category: string;
}): ReactElement {
  const { t } = useTranslation();
  if (!isItTicketCategory(category)) {
    return <Badge variant='secondary'>{category}</Badge>;
  }
  return (
    <Badge variant='secondary'>{t(IT_CATEGORY_LABEL_KEYS[category])}</Badge>
  );
}
