import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';

export interface TodoStatusBadgeProps {
  readonly completed: boolean;
}

/** The status of a todo, shown the same way wherever it appears. */
export function TodoStatusBadge({
  completed,
}: TodoStatusBadgeProps): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={completed ? 'secondary' : 'outline'}>
      {t(completed ? 'todos.status.completed' : 'todos.status.active')}
    </Badge>
  );
}
