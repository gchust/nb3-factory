import { useTranslation } from '@nocobase/i18n/client';
import { CalendarClock, GraduationCap, Users } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

import { useTrainingQuery, useTrainingViewer } from './client.js';
import {
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  StatusFor,
} from './components.js';
import {
  SESSION_STATUS_KEYS,
  formatDateTime,
  formatPercent,
  type LearningSession,
} from './types.js';

export default function TrainingMyLearningPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const viewer = useTrainingViewer();
  const sessions = useTrainingQuery<LearningSession[]>('training/my-learning');
  const roleText = viewer.data
    ? viewer.data.isAdmin
      ? t('training.roles.admin')
      : viewer.data.isInstructor
        ? t('training.roles.instructor')
        : viewer.data.isStudent
          ? t('training.roles.student')
          : t('training.roles.none')
    : '';

  return (
    <PageContainer>
      <Breadcrumbs />
      <PageHeader
        title={t('training.myLearning.title')}
        description={t('training.myLearning.description')}
      />

      {viewer.data ? (
        <p className='text-sm text-muted-foreground'>
          {t('training.myLearning.signedInAs', {
            name: viewer.data.name,
            role: roleText,
          })}
        </p>
      ) : null}

      {sessions.loading ? <LoadingBlock /> : null}
      {sessions.error ? (
        <ErrorBlock message={sessions.error} onRetry={sessions.reload} />
      ) : null}
      {!sessions.loading &&
      !sessions.error &&
      (sessions.data?.length ?? 0) === 0 ? (
        <EmptyBlock message={t('training.myLearning.empty')} />
      ) : null}

      <div className='grid gap-4 lg:grid-cols-2'>
        {(sessions.data ?? []).map((session) => {
          const done = session.gradedCount;
          const rate =
            session.assignmentCount === 0 ? 0 : done / session.assignmentCount;
          return (
            <Card key={session.id}>
              <CardHeader className='space-y-2'>
                <div className='flex items-center justify-between gap-2'>
                  <span className='font-mono text-xs text-muted-foreground'>
                    {session.code}
                  </span>
                  <StatusFor
                    labelKey={SESSION_STATUS_KEYS[session.status]}
                    tone={
                      session.status === 'completed'
                        ? 'success'
                        : session.status === 'cancelled'
                          ? 'danger'
                          : 'muted'
                    }
                  />
                </div>
                <CardTitle className='text-base'>{session.title}</CardTitle>
                <p className='text-sm text-muted-foreground'>
                  {session.courseTitle}
                </p>
              </CardHeader>
              <CardContent className='space-y-4 text-sm'>
                <div className='grid gap-2 text-xs text-muted-foreground sm:grid-cols-2'>
                  <span className='inline-flex items-center gap-1.5'>
                    <GraduationCap className='size-3.5' aria-hidden />
                    {t('training.session.instructor')}: {session.instructorName}
                  </span>
                  <span className='inline-flex items-center gap-1.5'>
                    <Users className='size-3.5' aria-hidden />
                    {t('training.session.enrolled', {
                      count: session.enrolledCount,
                      capacity: session.capacity,
                    })}
                  </span>
                  <span className='inline-flex items-center gap-1.5'>
                    <CalendarClock className='size-3.5' aria-hidden />
                    {formatDateTime(session.startAt, i18n.language)} —{' '}
                    {formatDateTime(session.endAt, i18n.language)}
                  </span>
                  <span>
                    {t('training.session.location')}: {session.location ?? '—'}
                  </span>
                </div>

                <div className='space-y-2'>
                  <div className='flex items-center justify-between text-xs text-muted-foreground'>
                    <span>
                      {t('training.myLearning.progress', {
                        graded: session.gradedCount,
                        total: session.assignmentCount,
                      })}
                    </span>
                    <span>{formatPercent(rate)}</span>
                  </div>
                  <Progress value={Math.round(rate * 100)} />
                  <div className='flex flex-wrap gap-3 text-xs text-muted-foreground'>
                    <span>
                      {t('training.myLearning.pending', {
                        count: session.submittedCount,
                      })}
                    </span>
                    <span>
                      {t('training.myLearning.returned', {
                        count: session.returnedCount,
                      })}
                    </span>
                    {session.nextDueAt ? (
                      <span>
                        {t('training.myLearning.nextDue', {
                          date: formatDateTime(
                            session.nextDueAt,
                            i18n.language,
                          ),
                        })}
                      </span>
                    ) : null}
                  </div>
                </div>

                <Button
                  variant='outline'
                  size='sm'
                  nativeButton={false}
                  render={<Link to={`/training/sessions/${session.id}`} />}
                >
                  {t('training.myLearning.openSession')}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </PageContainer>
  );
}
