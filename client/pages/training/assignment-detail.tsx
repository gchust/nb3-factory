import { useTranslation } from '@nocobase/i18n/client';
import { CalendarClock, Send, Undo2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link, useParams } from 'react-router';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import {
  useTrainingAction,
  useTrainingQuery,
  useTrainingViewer,
} from './client.js';
import { AttachmentList, AttachmentUploader } from './files.js';
import {
  DeniedBlock,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  SectionCard,
  StatusFor,
  StatusBadge,
} from './components.js';
import {
  ASSIGNMENT_STATUS_KEYS,
  SUBMISSION_STATUS_KEYS,
  formatDateTime,
  isOverdue,
  type AssignmentDetail,
  type FileAttachment,
  type SubmissionReviewView,
  type SubmissionView,
} from './types.js';

export default function TrainingAssignmentDetailPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const viewer = useTrainingViewer();
  const detail = useTrainingQuery<AssignmentDetail>(
    assignmentId ? `training/assignments/${assignmentId}` : 'training/me',
  );

  const canManage =
    (viewer.data?.isAdmin ?? false) ||
    ((viewer.data?.isInstructor ?? false) &&
      detail.data?.session.instructorId === viewer.data?.userId);

  const assignment = detail.data?.assignment;
  const isStudent = viewer.data?.isStudent ?? false;

  return (
    <PageContainer>
      <Breadcrumbs />
      {detail.loading ? <LoadingBlock /> : null}
      {detail.error ? (
        <>
          <PageHeader title={t('training.assignment.titleLabel')} />
          <ErrorBlock message={detail.error} onRetry={detail.reload} />
        </>
      ) : null}

      {assignment && detail.data ? (
        <>
          <PageHeader
            title={assignment.title}
            description={
              <span>
                <Link
                  className='underline underline-offset-4'
                  to={`/training/sessions/${detail.data.session.id}`}
                >
                  {detail.data.session.title}
                </Link>{' '}
                · {detail.data.session.courseTitle}
              </span>
            }
            actions={
              <StatusFor
                labelKey={ASSIGNMENT_STATUS_KEYS[assignment.status]}
                tone={assignment.status === 'published' ? 'success' : 'muted'}
              />
            }
          />

          <div className='flex flex-wrap items-center gap-3 text-sm text-muted-foreground'>
            <span
              className={
                isOverdue(assignment.dueAt) && assignment.status !== 'closed'
                  ? 'inline-flex items-center gap-1.5 text-destructive'
                  : 'inline-flex items-center gap-1.5'
              }
            >
              <CalendarClock className='size-3.5' aria-hidden />
              {t('training.assignment.dueAt')}:{' '}
              {formatDateTime(assignment.dueAt, i18n.language)}
            </span>
            <span>
              {t('training.assignment.maxScore')}: {assignment.maxScore}
            </span>
          </div>

          {assignment.description ? (
            <p className='max-w-3xl text-sm leading-6 whitespace-pre-wrap text-muted-foreground'>
              {assignment.description}
            </p>
          ) : null}

          {!canManage && isStudent ? (
            <StudentPanel
              detail={detail.data}
              studentId={viewer.data?.userId ?? ''}
              onChanged={detail.reload}
            />
          ) : null}

          {canManage ? (
            <InstructorPanel detail={detail.data} onChanged={detail.reload} />
          ) : null}

          {!canManage && !isStudent ? (
            <DeniedBlock message={t('training.errors.studentOnly')} />
          ) : null}
        </>
      ) : null}

      {!detail.loading && !detail.error && !assignment ? (
        <DeniedBlock message={t('training.errors.notFound')} />
      ) : null}
    </PageContainer>
  );
}

function StudentPanel({
  detail,
  studentId,
  onChanged,
}: {
  readonly detail: AssignmentDetail;
  readonly studentId: string;
  readonly onChanged: () => void;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const action = useTrainingAction();
  const [content, setContent] = useState('');
  const [pendingFiles, setPendingFiles] = useState<readonly FileAttachment[]>(
    [],
  );
  const [uploadBusy, setUploadBusy] = useState(false);

  const attempts = [...detail.submissions]
    .filter((submission) => submission.studentId === studentId)
    .sort((a, b) => a.attempt - b.attempt);
  const latest = attempts[attempts.length - 1];
  const closed = detail.assignment.status === 'closed';
  const canSubmit =
    detail.assignment.status === 'published' &&
    (!latest || latest.status === 'returned');

  const submit = async (): Promise<void> => {
    const result = await action.run((client) =>
      client.request({
        path: `training/assignments/${detail.assignment.id}/submissions`,
        method: 'POST',
        json: {
          content,
          fileIds: pendingFiles.map((file) => file.id),
        },
      }),
    );
    if (result !== undefined) {
      setContent('');
      setPendingFiles([]);
      onChanged();
    }
  };

  return (
    <SectionCard
      title={t('training.submission.myWork')}
      description={
        latest
          ? t('training.submission.latestStatus', {
              status: t(SUBMISSION_STATUS_KEYS[latest.status]),
              attempt: latest.attempt,
            })
          : t('training.submission.notSubmittedYet')
      }
    >
      {attempts.length === 0 ? (
        <EmptyBlock message={t('training.submission.noAttempts')} />
      ) : (
        <ol className='space-y-4'>
          {attempts.map((submission) => (
            <li
              key={submission.id}
              className='space-y-2 rounded-lg border border-border p-4'
            >
              <div className='flex flex-wrap items-center gap-2 text-sm'>
                <span className='font-medium'>
                  {t('training.submission.attempt', {
                    count: submission.attempt,
                  })}
                </span>
                <StatusFor
                  labelKey={SUBMISSION_STATUS_KEYS[submission.status]}
                  tone={
                    submission.status === 'graded'
                      ? 'success'
                      : submission.status === 'returned'
                        ? 'warning'
                        : 'muted'
                  }
                />
                {submission.isLate ? (
                  <StatusBadge
                    label={t('training.submission.late')}
                    tone='danger'
                  />
                ) : null}
                <span className='text-xs text-muted-foreground'>
                  {formatDateTime(submission.submittedAt, i18n.language)}
                </span>
                {submission.score !== null ? (
                  <span className='text-sm'>
                    {t('training.submission.score', {
                      score: submission.score,
                      max: submission.maxScore,
                    })}
                  </span>
                ) : null}
              </div>
              <p className='text-sm whitespace-pre-wrap text-muted-foreground'>
                {submission.content}
              </p>
              {submission.files.length > 0 ? (
                <div className='space-y-1'>
                  <p className='text-xs font-medium text-muted-foreground'>
                    {t('training.files.submissionGroup')}
                  </p>
                  <AttachmentList files={submission.files} />
                </div>
              ) : null}
              {submission.feedback ? (
                <p className='rounded-md bg-muted/60 p-3 text-sm'>
                  {t('training.submission.feedback')}: {submission.feedback}
                </p>
              ) : null}
              {submission.reviews.length > 0 ? (
                <ul className='space-y-2 text-xs text-muted-foreground'>
                  {submission.reviews.map((review) => (
                    <li key={review.id} className='space-y-1'>
                      <p>
                        {review.decision === 'graded'
                          ? t('training.review.gradedBy', {
                              name: review.reviewerName,
                              score: review.score ?? '—',
                            })
                          : t('training.review.returnedBy', {
                              name: review.reviewerName,
                            })}
                        {' · '}
                        {review.feedback}
                      </p>
                      {review.files.length > 0 ? (
                        <div className='space-y-1'>
                          <p className='font-medium'>
                            {t('training.files.reviewGroup')}
                          </p>
                          <AttachmentList files={review.files} />
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      <div className='space-y-2 border-t border-border pt-4'>
        {closed ? (
          <p className='text-sm text-muted-foreground'>
            {t('training.submission.closed')}
          </p>
        ) : null}
        {!closed && latest?.status === 'graded' ? (
          <p className='text-sm text-muted-foreground'>
            {t('training.submission.alreadyGraded')}
          </p>
        ) : null}
        {!closed && latest?.status === 'submitted' ? (
          <p className='text-sm text-muted-foreground'>
            {t('training.submission.awaitingReview')}
          </p>
        ) : null}
        {!closed && latest?.status === 'returned' ? (
          <p className='text-sm text-amber-600 dark:text-amber-400'>
            {t('training.submission.returnedNotice')}
          </p>
        ) : null}
        {canSubmit ? (
          <>
            <Label htmlFor='submission-content'>
              {t('training.submission.content')}
            </Label>
            <Textarea
              id='submission-content'
              rows={5}
              value={content}
              placeholder={t('training.submission.contentPlaceholder')}
              onChange={(event) => setContent(event.target.value)}
            />
            <div className='space-y-1'>
              <p className='text-xs font-medium text-muted-foreground'>
                {t('training.files.submissionGroup')}
              </p>
              <AttachmentUploader
                value={pendingFiles}
                onChange={setPendingFiles}
                onBusyChange={setUploadBusy}
              />
            </div>
            {isOverdue(detail.assignment.dueAt) ? (
              <p className='text-xs text-destructive'>
                {t('training.submission.lateWarning')}
              </p>
            ) : null}
            {action.error ? (
              <p className='text-sm text-destructive' role='alert'>
                {action.error}
              </p>
            ) : null}
            <Button
              disabled={action.pending || uploadBusy || !content.trim()}
              onClick={() => void submit()}
            >
              <Send className='size-4' aria-hidden />
              {t('training.submission.submit')}
            </Button>
          </>
        ) : null}
      </div>
    </SectionCard>
  );
}

function InstructorPanel({
  detail,
  onChanged,
}: {
  readonly detail: AssignmentDetail;
  readonly onChanged: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const groups = new Map<string, SubmissionView[]>();
  for (const submission of detail.submissions) {
    const current = groups.get(submission.studentId) ?? [];
    current.push(submission);
    groups.set(submission.studentId, current);
  }

  return (
    <SectionCard
      title={t('training.review.title')}
      description={t('training.review.description', {
        n: detail.submissions.length,
      })}
    >
      {groups.size === 0 ? (
        <EmptyBlock message={t('training.review.empty')} />
      ) : (
        <div className='space-y-4'>
          {[...groups.entries()].map(([studentId, submissions]) => (
            <StudentReviewCard
              key={studentId}
              submissions={submissions}
              maxScore={detail.assignment.maxScore}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function StudentReviewCard({
  submissions,
  maxScore,
  onChanged,
}: {
  readonly submissions: readonly SubmissionView[];
  readonly maxScore: number;
  readonly onChanged: () => void;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const action = useTrainingAction();
  const locale = i18n.language;
  const ordered = [...submissions].sort((a, b) => a.attempt - b.attempt);
  const latest = ordered[ordered.length - 1];
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');
  const [pendingFiles, setPendingFiles] = useState<readonly FileAttachment[]>(
    [],
  );
  const [uploadBusy, setUploadBusy] = useState(false);

  const review = async (decision: 'graded' | 'returned'): Promise<void> => {
    const result = await action.run((client) =>
      client.request({
        path: `training/submissions/${latest.id}/review`,
        method: 'POST',
        json: {
          decision,
          score: decision === 'graded' ? Number(score) : null,
          feedback,
          fileIds: pendingFiles.map((file) => file.id),
        },
      }),
    );
    if (result !== undefined) {
      setScore('');
      setFeedback('');
      setPendingFiles([]);
      onChanged();
    }
  };

  return (
    <div className='space-y-3 rounded-lg border border-border p-4'>
      <div className='flex flex-wrap items-center gap-2 text-sm'>
        <span className='font-medium'>
          {latest.studentName ?? latest.studentId}
        </span>
        <StatusFor
          labelKey={SUBMISSION_STATUS_KEYS[latest.status]}
          tone={
            latest.status === 'graded'
              ? 'success'
              : latest.status === 'returned'
                ? 'warning'
                : 'muted'
          }
        />
        {latest.isLate ? (
          <StatusBadge label={t('training.submission.late')} tone='danger' />
        ) : null}
        <span className='text-xs text-muted-foreground'>
          {t('training.submission.attempt', { count: latest.attempt })} ·{' '}
          {formatDateTime(latest.submittedAt, locale)}
        </span>
      </div>
      <p className='text-sm whitespace-pre-wrap text-muted-foreground'>
        {latest.content}
      </p>
      {latest.files.length > 0 ? (
        <div className='space-y-1'>
          <p className='text-xs font-medium text-muted-foreground'>
            {t('training.files.submissionGroup')}
          </p>
          <AttachmentList files={latest.files} />
        </div>
      ) : null}
      {ordered.length > 1 ? (
        <ul className='space-y-1 text-xs text-muted-foreground'>
          {ordered.slice(0, -1).map((submission) => (
            <li key={submission.id}>
              {t('training.submission.attempt', { count: submission.attempt })}:{' '}
              {t(SUBMISSION_STATUS_KEYS[submission.status])}
              {submission.feedback ? ` · ${submission.feedback}` : ''}
            </li>
          ))}
        </ul>
      ) : null}

      {latest.status === 'submitted' ? (
        <div className='space-y-3 border-t border-border pt-3'>
          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='space-y-2'>
              <Label htmlFor={`score-${latest.id}`}>
                {t('training.review.scoreLabel', { max: maxScore })}
              </Label>
              <Input
                id={`score-${latest.id}`}
                type='number'
                min={0}
                max={maxScore}
                value={score}
                onChange={(event) => setScore(event.target.value)}
              />
            </div>
          </div>
          <div className='space-y-2'>
            <Label htmlFor={`feedback-${latest.id}`}>
              {t('training.submission.feedback')}
            </Label>
            <Textarea
              id={`feedback-${latest.id}`}
              rows={3}
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
            />
          </div>
          <div className='space-y-1'>
            <p className='text-xs font-medium text-muted-foreground'>
              {t('training.files.reviewGroup')}
            </p>
            <AttachmentUploader
              value={pendingFiles}
              onChange={setPendingFiles}
              onBusyChange={setUploadBusy}
            />
          </div>
          {action.error ? (
            <p className='text-sm text-destructive' role='alert'>
              {action.error}
            </p>
          ) : null}
          <div className='flex gap-2'>
            <Button
              disabled={action.pending || uploadBusy || score === ''}
              onClick={() => void review('graded')}
            >
              {t('training.review.grade')}
            </Button>
            <Button
              variant='outline'
              disabled={action.pending || uploadBusy || !feedback.trim()}
              onClick={() => void review('returned')}
            >
              <Undo2 className='size-4' aria-hidden />
              {t('training.review.return')}
            </Button>
          </div>
        </div>
      ) : (
        <div className='space-y-2 border-t border-border pt-3 text-sm'>
          {latest.score !== null ? (
            <p>
              {t('training.submission.score', {
                score: latest.score,
                max: latest.maxScore,
              })}
            </p>
          ) : null}
          {latest.feedback ? (
            <p className='text-muted-foreground'>
              {t('training.submission.feedback')}: {latest.feedback}
            </p>
          ) : null}
          {latest.reviews.length > 0 ? (
            <ul className='space-y-2 text-xs text-muted-foreground'>
              {latest.reviews.map((item) => (
                <ReviewHistoryItem
                  key={item.id}
                  review={item}
                  locale={locale}
                />
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ReviewHistoryItem({
  review,
  locale,
}: {
  readonly review: SubmissionReviewView;
  readonly locale: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <li className='space-y-1'>
      <p>
        {review.decision === 'graded'
          ? t('training.review.gradedBy', {
              name: review.reviewerName,
              score: review.score ?? '—',
            })
          : t('training.review.returnedBy', {
              name: review.reviewerName,
            })}
        {' · '}
        {formatDateTime(review.createdAt, locale)}
      </p>
      {review.files.length > 0 ? (
        <div className='space-y-1'>
          <p className='font-medium'>{t('training.files.reviewGroup')}</p>
          <AttachmentList files={review.files} />
        </div>
      ) : null}
    </li>
  );
}
