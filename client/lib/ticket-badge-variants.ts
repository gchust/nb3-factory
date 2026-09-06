import type { ComponentProps } from 'react';

import type { TicketPriority, TicketStatus } from './it-service-desk-api.js';
import type { Badge } from '../components/ui/badge';

type BadgeVariant = ComponentProps<typeof Badge>['variant'];

export function statusBadgeVariant(status: TicketStatus): BadgeVariant {
  switch (status) {
    case 'pending':
      return 'secondary';
    case 'inProgress':
      return 'default';
    case 'resolved':
      return 'outline';
    case 'closed':
      return 'ghost';
  }
}

export function priorityBadgeVariant(priority: TicketPriority): BadgeVariant {
  switch (priority) {
    case 'low':
      return 'outline';
    case 'normal':
      return 'secondary';
    case 'high':
      return 'default';
    case 'urgent':
      return 'destructive';
  }
}
