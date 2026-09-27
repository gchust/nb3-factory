import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';

import type { Visitor } from './types.js';

/** On-site and already-left are the two states of the register, shown the same way everywhere. */
export function VisitorStatusBadge({
  visitor,
}: {
  readonly visitor: Visitor;
}): ReactElement {
  const { t } = useTranslation();
  if (visitor.departedAt) {
    return <Badge variant='outline'>{t('visitors.status.left')}</Badge>;
  }
  return <Badge variant='secondary'>{t('visitors.status.onSite')}</Badge>;
}
