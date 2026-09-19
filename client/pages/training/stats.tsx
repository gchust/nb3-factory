import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { useTrainingQuery, useTrainingViewer } from './client.js';
import {
  DeniedBlock,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
} from './components.js';
import { formatPercent, type CompletionStat } from './types.js';

export default function TrainingStatsPage(): ReactElement {
  const { t } = useTranslation();
  const viewer = useTrainingViewer();
  const allowed = viewer.data?.isInstructor ?? false;
  const stats = useTrainingQuery<CompletionStat[]>(
    allowed ? 'training/stats/completion' : 'training/me',
  );

  return (
    <PageContainer>
      <Breadcrumbs />
      <PageHeader
        title={t('training.stats.title')}
        description={t('training.stats.description')}
      />

      {viewer.loading ? <LoadingBlock /> : null}
      {viewer.error ? (
        <ErrorBlock message={viewer.error} onRetry={viewer.reload} />
      ) : null}
      {!viewer.loading && viewer.data && !allowed ? (
        <DeniedBlock message={t('training.errors.instructorOnly')} />
      ) : null}

      {allowed && stats.loading ? <LoadingBlock /> : null}
      {allowed && stats.error ? (
        <ErrorBlock message={stats.error} onRetry={stats.reload} />
      ) : null}
      {allowed &&
      !stats.loading &&
      !stats.error &&
      (stats.data?.length ?? 0) === 0 ? (
        <EmptyBlock message={t('training.stats.empty')} />
      ) : null}

      {allowed && (stats.data?.length ?? 0) > 0 ? (
        <div className='rounded-xl border border-border bg-card'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('training.stats.session')}</TableHead>
                <TableHead>{t('training.stats.expected')}</TableHead>
                <TableHead>{t('training.stats.graded')}</TableHead>
                <TableHead>{t('training.stats.pending')}</TableHead>
                <TableHead>{t('training.stats.returned')}</TableHead>
                <TableHead>{t('training.stats.notSubmitted')}</TableHead>
                <TableHead>{t('training.stats.late')}</TableHead>
                <TableHead>{t('training.stats.averageScore')}</TableHead>
                <TableHead className='w-48'>
                  {t('training.stats.completionRate')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(stats.data ?? []).map((row) => (
                <TableRow key={row.sessionId}>
                  <TableCell>
                    <div className='font-medium'>{row.sessionTitle}</div>
                    <div className='text-xs text-muted-foreground'>
                      {row.courseTitle} · {row.instructorName}
                    </div>
                  </TableCell>
                  <TableCell>{row.expected}</TableCell>
                  <TableCell className='text-primary'>{row.graded}</TableCell>
                  <TableCell>{row.pending}</TableCell>
                  <TableCell>{row.returned}</TableCell>
                  <TableCell>{row.notSubmitted}</TableCell>
                  <TableCell>{row.late}</TableCell>
                  <TableCell>
                    {row.averageScore === null
                      ? '—'
                      : row.averageScore.toFixed(1)}
                  </TableCell>
                  <TableCell>
                    <div className='flex items-center gap-2'>
                      <Progress value={Math.round(row.completionRate * 100)} />
                      <span className='w-10 text-right text-xs text-muted-foreground'>
                        {formatPercent(row.completionRate)}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </PageContainer>
  );
}
