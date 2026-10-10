import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import type { ServiceOrderLog } from '@/api/service-types';
import { OrderStatusBadge } from '@/components/service/status-badge';
import { Badge } from '@/components/ui/badge';

/**
 * The order's history.
 *
 * Every state change writes one `service_order_logs` row through the same
 * transaction as the change itself, so this list is the record of what
 * happened rather than a summary the page recomputed. The idempotency key is
 * shown for a row the automation already handled: a repeat trigger is visible
 * as one entry, not as two.
 */
export function OrderTimeline({
  logs,
}: {
  readonly logs: readonly ServiceOrderLog[];
}): ReactElement {
  const { t } = useTranslation();
  if (logs.length === 0) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('service.orders.timelineEmpty')}
      </p>
    );
  }
  return (
    <ol className='space-y-3'>
      {logs.map((log) => {
        // An action a newer revision added stays visible as its raw token
        // rather than as an untranslated key.
        const actionKey = `service.orderAction.${log.action}`;
        const actionText = t(actionKey);
        return (
          <li className='flex gap-3 text-sm' key={log.id}>
            <span
              aria-hidden='true'
              className='mt-1.5 size-1.5 shrink-0 rounded-full bg-primary'
            />
            <div className='min-w-0 space-y-1'>
              <div className='flex flex-wrap items-center gap-2'>
                <Badge variant='outline'>
                  {actionText === actionKey ? log.action : actionText}
                </Badge>
                {log.status ? <OrderStatusBadge status={log.status} /> : null}
                <time className='text-xs text-muted-foreground'>
                  {log.createdAt}
                </time>
              </div>
              <p className='break-words'>{log.message}</p>
              {log.idempotencyKey ? (
                <p className='font-mono text-xs text-muted-foreground'>
                  {log.idempotencyKey}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
