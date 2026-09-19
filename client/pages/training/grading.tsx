import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
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
  StatusBadge,
} from './components.js';
import { formatDateTime, type GradingTodoItem } from './types.js';

export default function TrainingGradingPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const viewer = useTrainingViewer();
  const allowed = viewer.data?.isInstructor ?? false;
  const todo = useTrainingQuery<GradingTodoItem[]>(
    allowed ? 'training/grading-todo' : 'training/me',
  );

  return (
    <PageContainer>
      <Breadcrumbs />
      <PageHeader
        title={t('training.grading.title')}
        description={t('training.grading.description')}
      />

      {viewer.loading ? <LoadingBlock /> : null}
      {viewer.error ? (
        <ErrorBlock message={viewer.error} onRetry={viewer.reload} />
      ) : null}
      {!viewer.loading && viewer.data && !allowed ? (
        <DeniedBlock message={t('training.errors.instructorOnly')} />
      ) : null}

      {allowed && todo.loading ? <LoadingBlock /> : null}
      {allowed && todo.error ? (
        <ErrorBlock message={todo.error} onRetry={todo.reload} />
      ) : null}
      {allowed &&
      !todo.loading &&
      !todo.error &&
      (todo.data?.length ?? 0) === 0 ? (
        <EmptyBlock message={t('training.grading.empty')} />
      ) : null}

      {allowed && (todo.data?.length ?? 0) > 0 ? (
        <div className='rounded-xl border border-border bg-card'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('training.grading.session')}</TableHead>
                <TableHead>{t('training.grading.assignment')}</TableHead>
                <TableHead>{t('training.grading.student')}</TableHead>
                <TableHead>{t('training.grading.submittedAt')}</TableHead>
                <TableHead>{t('training.grading.status')}</TableHead>
                <TableHead className='text-right'>
                  {t('training.grading.action')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(todo.data ?? []).map((item) => (
                <TableRow key={item.submissionId}>
                  <TableCell className='text-muted-foreground'>
                    {item.sessionTitle}
                  </TableCell>
                  <TableCell>{item.assignmentTitle}</TableCell>
                  <TableCell>
                    {item.studentName}
                    <span className='ml-2 text-xs text-muted-foreground'>
                      {t('training.grading.attempt', { count: item.attempt })}
                    </span>
                  </TableCell>
                  <TableCell>
                    {formatDateTime(item.submittedAt, i18n.language)}
                  </TableCell>
                  <TableCell>
                    {item.isLate ? (
                      <StatusBadge
                        label={t('training.submission.late')}
                        tone='danger'
                      />
                    ) : (
                      <StatusBadge
                        label={t('training.submission.onTime')}
                        tone='success'
                      />
                    )}
                  </TableCell>
                  <TableCell className='text-right'>
                    <Button
                      size='sm'
                      variant='outline'
                      nativeButton={false}
                      render={
                        <Link
                          to={`/training/assignments/${item.assignmentId}`}
                        />
                      }
                    >
                      {t('training.grading.review')}
                    </Button>
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
