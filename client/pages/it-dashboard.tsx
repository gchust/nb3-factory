import { useTranslation } from '@nocobase/i18n/client';
import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { PageHeader } from '@/components/it/page-header.js';
import { Loading } from '@/components/loading.js';
import { Button } from '@/components/ui/button.js';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card.js';
import { useItApi, type ItDashboard } from '@/lib/it-api.js';
import { describeError, formatHours } from '@/lib/it-format.js';

const ASSET_STATUSES = ['in_use', 'idle', 'repairing', 'scrapped'] as const;
const PRIORITIES = ['low', 'medium', 'high'] as const;

export default function ItDashboardPage(): ReactElement {
  const { t } = useTranslation();
  const api = useItApi();
  const [stats, setStats] = useState<ItDashboard>();
  const [error, setError] = useState<string>();
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    api.dashboard().then(
      (data) => {
        if (!active) return;
        setStats(data);
        setError(undefined);
      },
      (cause: unknown) => {
        if (active) setError(describeError(t, cause));
      },
    );
    return () => {
      active = false;
    };
  }, [api, t, version]);

  return (
    <section className='mx-auto w-full max-w-6xl space-y-6 px-6 py-8'>
      <PageHeader
        title={t('it.dashboard.title')}
        description={t('it.dashboard.description')}
        actions={
          <Button variant='outline' size='sm' onClick={reload}>
            <RefreshCw className='size-4' />
            {t('it.common.refresh')}
          </Button>
        }
      />

      {error ? (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      ) : null}

      {!stats ? (
        <Loading label={t('it.common.loading')} />
      ) : (
        <div className='space-y-6'>
          <Card>
            <CardHeader>
              <CardTitle>{t('it.dashboard.assetsByStatus')}</CardTitle>
              <CardDescription>
                {t('it.dashboard.assetsByStatusHint')}
              </CardDescription>
            </CardHeader>
            <CardContent className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
              {ASSET_STATUSES.map((status) => (
                <StatTile
                  key={status}
                  label={t(`it.assetStatus.${status}`)}
                  value={stats.assetsByStatus[status] ?? 0}
                />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('it.dashboard.workOrdersByPriority')}</CardTitle>
              <CardDescription>
                {t('it.dashboard.workOrdersByPriorityHint')}
              </CardDescription>
            </CardHeader>
            <CardContent className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
              {PRIORITIES.map((priority) => (
                <StatTile
                  key={priority}
                  label={t(`it.priority.${priority}`)}
                  value={stats.workOrdersByPriority[priority] ?? 0}
                />
              ))}
              <StatTile
                label={t('it.dashboard.completedWorkOrders')}
                value={stats.completedWorkOrders}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('it.dashboard.averageCompletion')}</CardTitle>
              <CardDescription>
                {t('it.dashboard.averageCompletionHint')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StatTile
                label={t('it.dashboard.hours')}
                value={formatHours(stats.averageCompletionHours)}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}

function StatTile({
  label,
  value,
}: {
  readonly label: string;
  readonly value: number | string;
}): ReactElement {
  return (
    <div className='rounded-lg border border-border bg-muted/30 px-4 py-3'>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <p className='font-heading text-2xl font-semibold tabular-nums'>
        {value}
      </p>
    </div>
  );
}
