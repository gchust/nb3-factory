import { useTranslation } from '@nocobase/i18n/client';

import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card';
import type { LeaveStats } from './types.js';

export function LeaveStatsCards({
  stats,
  showTeam,
}: {
  readonly stats: LeaveStats | undefined;
  readonly showTeam: boolean;
}) {
  const { t } = useTranslation();
  const items = [
    { key: 'pending', label: t('leave.stats.pending'), value: stats?.pending },
    {
      key: 'approved',
      label: t('leave.stats.approved'),
      value: stats?.approved,
    },
    {
      key: 'yearTotal',
      label: t('leave.stats.yearTotal'),
      value: stats?.yearTotal,
    },
    ...(showTeam
      ? [
          {
            key: 'teamPending',
            label: t('leave.stats.teamPending'),
            value: stats?.teamPending ?? 0,
          },
        ]
      : []),
  ];
  return (
    <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
      {items.map((item) => (
        <Card key={item.key} size='sm'>
          <CardHeader>
            <CardTitle className='text-sm font-normal text-muted-foreground'>
              {item.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className='font-heading text-2xl font-semibold tabular-nums'>
              {item.value ?? '—'}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
