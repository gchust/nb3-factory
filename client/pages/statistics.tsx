import type { ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { apiClientToken, useService } from '@nocobase/app-client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AsyncSection } from '@/components/production/async-section';
import {
  formatDefectRate,
  productionApi,
  type Statistics,
  type StatisticsGroup,
} from '@/lib/production-api';
import { useAsync } from '@/lib/use-async';

function GroupTable({
  groups,
  nameLabel,
}: {
  readonly groups: readonly StatisticsGroup[];
  readonly nameLabel: string;
}): ReactElement {
  const { t } = useTranslation();
  if (groups.length === 0) {
    return (
      <p className='py-4 text-center text-sm text-muted-foreground'>
        {t('production.common.empty')}
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{nameLabel}</TableHead>
          <TableHead className='text-right'>
            {t('production.workOrders.qualified')}
          </TableHead>
          <TableHead className='text-right'>
            {t('production.workOrders.defect')}
          </TableHead>
          <TableHead className='text-right'>
            {t('production.statistics.defectRate')}
          </TableHead>
          <TableHead className='text-right'>
            {t('production.statistics.reportCount')}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((group) => (
          <TableRow key={group.teamId ?? group.productId}>
            <TableCell className='font-medium'>
              {group.teamName ?? group.productName}
            </TableCell>
            <TableCell className='text-right'>
              {group.qualifiedQuantity}
            </TableCell>
            <TableCell className='text-right'>{group.defectQuantity}</TableCell>
            <TableCell className='text-right'>
              {formatDefectRate(group.defectRate)}
            </TableCell>
            <TableCell className='text-right'>{group.reportCount}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function StatisticsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useService(apiClientToken);
  const state = useAsync<Statistics>(
    () => productionApi.statistics(api),
    'statistics',
  );

  return (
    <section className='mx-auto w-full max-w-6xl space-y-6 p-6'>
      <header className='space-y-1'>
        <h1 className='font-heading text-2xl font-semibold tracking-tight'>
          {t('production.statistics.title')}
        </h1>
        <p className='text-sm text-muted-foreground'>
          {t('production.statistics.subtitle')}
        </p>
      </header>

      <AsyncSection
        error={state.error}
        onRetry={() => void state.reload()}
        status={state.status}
      >
        {state.data ? (
          <>
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
              <SummaryCard
                label={t('production.statistics.inProduction')}
                value={state.data.inProductionCount}
              />
              <SummaryCard
                label={t('production.workOrders.qualified')}
                value={state.data.totals.qualifiedQuantity}
              />
              <SummaryCard
                label={t('production.workOrders.defect')}
                value={state.data.totals.defectQuantity}
              />
              <SummaryCard
                label={t('production.statistics.defectRate')}
                value={formatDefectRate(state.data.totals.defectRate)}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>{t('production.statistics.byTeam')}</CardTitle>
              </CardHeader>
              <CardContent>
                <GroupTable
                  groups={state.data.byTeam}
                  nameLabel={t('production.workOrders.team')}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('production.statistics.byProduct')}</CardTitle>
              </CardHeader>
              <CardContent>
                <GroupTable
                  groups={state.data.byProduct}
                  nameLabel={t('production.workOrders.product')}
                />
              </CardContent>
            </Card>
          </>
        ) : null}
      </AsyncSection>
    </section>
  );
}

function SummaryCard({
  label,
  value,
}: {
  readonly label: string;
  readonly value: number | string;
}): ReactElement {
  return (
    <Card>
      <CardContent className='pt-6'>
        <p className='text-sm text-muted-foreground'>{label}</p>
        <p className='mt-1 text-2xl font-semibold'>{value}</p>
      </CardContent>
    </Card>
  );
}
