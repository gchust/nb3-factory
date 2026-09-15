import { useTranslation } from '@nocobase/i18n/client';
import { apiClientToken, useService } from '@nocobase/app-client';
import { RefreshCw } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TICKET_PRIORITIES, TICKET_STATUSES } from '@/lib/support-constants';
import {
  fetchTicketStats,
  supportErrorKey,
  type TicketStats,
} from '@/lib/support';

export default function TicketStatsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useService(apiClientToken);
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchTicketStats(api);
        if (cancelled) return;
        setStats(data);
        setError(null);
      } catch (cause) {
        if (!cancelled) setError(supportErrorKey(cause));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, reloadToken]);

  return (
    <section className='mx-auto w-full max-w-4xl space-y-8 px-6 py-8'>
      <header className='flex flex-wrap items-start justify-between gap-3'>
        <div className='space-y-1'>
          <h1 className='font-heading text-2xl font-semibold tracking-tight'>
            {t('support.stats.title')}
          </h1>
          <p className='text-sm text-muted-foreground'>
            {t('support.stats.description')}
          </p>
        </div>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={loading}
          onClick={() => {
            setLoading(true);
            setReloadToken((token) => token + 1);
          }}
        >
          <RefreshCw aria-hidden='true' />
          {t('support.stats.refresh')}
        </Button>
      </header>

      {loading ? (
        <p className='text-sm text-muted-foreground'>
          {t('support.common.loading')}
        </p>
      ) : error || !stats ? (
        <p className='text-sm text-destructive' role='alert'>
          {t(error ?? 'support.errors.UNKNOWN')}
        </p>
      ) : (
        <>
          <div className='rounded-xl border border-border bg-card p-5'>
            <p className='text-sm text-muted-foreground'>
              {t('support.stats.total')}
            </p>
            <p
              className='font-heading text-3xl font-semibold'
              data-testid='stats-total'
            >
              {stats.total}
            </p>
          </div>

          <StatsGroup
            title={t('support.stats.byStatus')}
            keys={TICKET_STATUSES}
            labelFor={(key) => t(`support.status.${key}`)}
            counts={stats.byStatus}
            total={stats.total}
          />
          <StatsGroup
            title={t('support.stats.byPriority')}
            keys={TICKET_PRIORITIES}
            labelFor={(key) => t(`support.priority.${key}`)}
            counts={stats.byPriority}
            total={stats.total}
          />
        </>
      )}
    </section>
  );
}

function StatsGroup({
  title,
  keys,
  labelFor,
  counts,
  total,
}: {
  readonly title: string;
  readonly keys: readonly string[];
  readonly labelFor: (key: string) => string;
  readonly counts: readonly { key: string; count: number }[];
  readonly total: number;
}): ReactElement {
  const byKey = new Map(counts.map((entry) => [entry.key, entry.count]));
  const extra = counts.filter((entry) => !keys.includes(entry.key));
  const rows = [
    ...keys.map((key) => ({ key, count: byKey.get(key) ?? 0 })),
    ...extra,
  ];

  return (
    <section className='space-y-3'>
      <h2 className='font-heading text-lg font-medium'>{title}</h2>
      <ul className='space-y-2 rounded-xl border border-border bg-card p-5'>
        {rows.map((row) => {
          const share = total > 0 ? Math.round((row.count / total) * 100) : 0;
          return (
            <li
              key={row.key}
              className='space-y-1'
              data-testid={`stats-row-${row.key}`}
            >
              <div className='flex items-center justify-between text-sm'>
                <span>{labelFor(row.key)}</span>
                <span
                  className='font-medium'
                  data-testid={`stats-count-${row.key}`}
                >
                  {row.count}
                </span>
              </div>
              <div className='h-1.5 w-full overflow-hidden rounded-full bg-muted'>
                <div
                  className={cn('h-full rounded-full bg-primary')}
                  style={{ width: `${share}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
