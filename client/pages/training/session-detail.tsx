import { useTranslation } from '@nocobase/i18n/client';
import { CalendarClock, MapPin, Plus, Users } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link, useParams } from 'react-router';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

import {
  useTrainingAction,
  useTrainingQuery,
  useTrainingViewer,
} from './client.js';
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
  ASSIGNMENT_STATUSES,
  ASSIGNMENT_STATUS_KEYS,
  SESSION_STATUS_KEYS,
  SUBMISSION_STATUS_KEYS,
  formatDateTime,
  fromDateTimeLocal,
  isOverdue,
  toDateTimeLocal,
  type AssignmentStatus,
  type AssignmentView,
  type SessionDetail,
} from './types.js';

export default function TrainingSessionDetailPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const { sessionId } = useParams<{ sessionId: string }>();
  const viewer = useTrainingViewer();
  const detail = useTrainingQuery<SessionDetail>(
    sessionId ? `training/sessions/${sessionId}` : 'training/me',
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AssignmentView | null>(null);

  const session = detail.data?.session;
  const canManage =
    (viewer.data?.isAdmin ?? false) ||
    ((viewer.data?.isInstructor ?? false) &&
      session?.instructorId === viewer.data?.userId);

  return (
    <PageContainer>
      <Breadcrumbs />
      {detail.loading ? <LoadingBlock /> : null}
      {detail.error ? (
        <>
          <PageHeader title={t('training.session.title')} />
          <ErrorBlock message={detail.error} onRetry={detail.reload} />
        </>
      ) : null}

      {session ? (
        <>
          <PageHeader
            title={session.title}
            description={`${session.courseCode} · ${session.courseTitle}`}
            actions={
              canManage ? (
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className='size-4' aria-hidden />
                  {t('training.assignment.create')}
                </Button>
              ) : null
            }
          />
          <div className='flex flex-wrap items-center gap-3 text-sm text-muted-foreground'>
            <StatusFor
              labelKey={SESSION_STATUS_KEYS[session.status]}
              tone={session.status === 'completed' ? 'success' : 'muted'}
            />
            <span className='font-mono text-xs'>{session.code}</span>
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
            <span className='inline-flex items-center gap-1.5'>
              <MapPin className='size-3.5' aria-hidden />
              {session.location ?? '—'}
            </span>
            <span>
              {t('training.session.instructor')}: {session.instructorName}
            </span>
          </div>

          <SectionCard title={t('training.session.assignments')}>
            {(detail.data?.assignments.length ?? 0) === 0 ? (
              <EmptyBlock message={t('training.session.noAssignments')} />
            ) : (
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        {t('training.assignment.titleLabel')}
                      </TableHead>
                      <TableHead>{t('training.assignment.dueAt')}</TableHead>
                      <TableHead>
                        {t('training.assignment.statusLabel')}
                      </TableHead>
                      {canManage ? (
                        <>
                          <TableHead>
                            {t('training.assignment.submitted')}
                          </TableHead>
                          <TableHead>
                            {t('training.assignment.graded')}
                          </TableHead>
                          <TableHead>
                            {t('training.assignment.pending')}
                          </TableHead>
                        </>
                      ) : null}
                      <TableHead className='text-right'>
                        {t('training.assignment.action')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(detail.data?.assignments ?? []).map((assignment) => (
                      <TableRow key={assignment.id}>
                        <TableCell>
                          <div className='font-medium'>{assignment.title}</div>
                          {assignment.mySubmission ? (
                            <div className='mt-1 flex items-center gap-2 text-xs text-muted-foreground'>
                              <StatusFor
                                labelKey={
                                  SUBMISSION_STATUS_KEYS[
                                    assignment.mySubmission.status
                                  ]
                                }
                                tone={
                                  assignment.mySubmission.status === 'graded'
                                    ? 'success'
                                    : assignment.mySubmission.status ===
                                        'returned'
                                      ? 'warning'
                                      : 'muted'
                                }
                              />
                              {assignment.mySubmission.isLate ? (
                                <StatusBadge
                                  label={t('training.submission.late')}
                                  tone='danger'
                                />
                              ) : null}
                              {assignment.mySubmission.score !== null ? (
                                <span>
                                  {t('training.submission.score', {
                                    score: assignment.mySubmission.score,
                                    max: assignment.maxScore,
                                  })}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <span
                            className={
                              isOverdue(assignment.dueAt) &&
                              assignment.status !== 'closed'
                                ? 'text-destructive'
                                : undefined
                            }
                          >
                            {formatDateTime(assignment.dueAt, i18n.language)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <StatusFor
                            labelKey={ASSIGNMENT_STATUS_KEYS[assignment.status]}
                            tone={
                              assignment.status === 'published'
                                ? 'success'
                                : assignment.status === 'closed'
                                  ? 'muted'
                                  : 'warning'
                            }
                          />
                        </TableCell>
                        {canManage ? (
                          <>
                            <TableCell>{assignment.submissionCount}</TableCell>
                            <TableCell>{assignment.gradedCount}</TableCell>
                            <TableCell>{assignment.pendingCount}</TableCell>
                          </>
                        ) : null}
                        <TableCell className='text-right'>
                          <div className='flex justify-end gap-2'>
                            {canManage ? (
                              <Button
                                size='sm'
                                variant='outline'
                                onClick={() => setEditing(assignment)}
                              >
                                {t('training.assignment.edit')}
                              </Button>
                            ) : null}
                            <Button
                              size='sm'
                              nativeButton={false}
                              render={
                                <Link
                                  to={`/training/assignments/${assignment.id}`}
                                />
                              }
                            >
                              {canManage
                                ? t('training.assignment.review')
                                : t('training.assignment.open')}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>

          {canManage ? (
            <SectionCard title={t('training.session.roster')}>
              {(detail.data?.roster.length ?? 0) === 0 ? (
                <EmptyBlock message={t('training.session.noRoster')} />
              ) : (
                <ul className='flex flex-wrap gap-2'>
                  {(detail.data?.roster ?? []).map((student) => (
                    <li
                      key={student.studentId}
                      className='rounded-lg border border-border px-3 py-1.5 text-sm'
                    >
                      {student.studentName}
                      <span className='ml-2 font-mono text-xs text-muted-foreground'>
                        {student.studentId}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          ) : null}

          {sessionId ? (
            <AssignmentFormDialog
              open={createOpen}
              onOpenChange={setCreateOpen}
              sessionId={Number(sessionId)}
              onSaved={detail.reload}
            />
          ) : null}
          {editing ? (
            <AssignmentFormDialog
              open={editing !== null}
              onOpenChange={(open) => {
                if (!open) setEditing(null);
              }}
              sessionId={editing.sessionId}
              assignment={editing}
              onSaved={() => {
                setEditing(null);
                detail.reload();
              }}
            />
          ) : null}
        </>
      ) : null}

      {!detail.loading && !detail.error && !session ? (
        <DeniedBlock message={t('training.errors.notFound')} />
      ) : null}
    </PageContainer>
  );
}

function AssignmentFormDialog({
  open,
  onOpenChange,
  sessionId,
  assignment,
  onSaved,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly sessionId: number;
  readonly assignment?: AssignmentView;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const action = useTrainingAction();
  const [title, setTitle] = useState(assignment?.title ?? '');
  const [description, setDescription] = useState(assignment?.description ?? '');
  const [dueAt, setDueAt] = useState(() => toDateTimeLocal(assignment?.dueAt));
  const [maxScore, setMaxScore] = useState(String(assignment?.maxScore ?? 100));
  const [status, setStatus] = useState<AssignmentStatus>(
    assignment?.status ?? 'draft',
  );

  const submit = async (): Promise<void> => {
    const result = await action.run((client) =>
      assignment
        ? client.request({
            path: `training/assignments/${assignment.id}`,
            method: 'PATCH',
            json: {
              title,
              description,
              dueAt: fromDateTimeLocal(dueAt),
              maxScore: Number(maxScore),
              status,
            },
          })
        : client.request({
            path: 'training/assignments',
            method: 'POST',
            json: {
              sessionId,
              title,
              description,
              dueAt: fromDateTimeLocal(dueAt),
              maxScore: Number(maxScore),
              status,
            },
          }),
    );
    if (result !== undefined) {
      onSaved();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>
            {assignment
              ? t('training.assignment.edit')
              : t('training.assignment.create')}
          </DialogTitle>
          <DialogDescription>
            {t('training.assignment.formHint')}
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-3'>
          <div className='space-y-2'>
            <Label htmlFor='assignment-title'>
              {t('training.assignment.titleLabel')}
            </Label>
            <Input
              id='assignment-title'
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='assignment-description'>
              {t('training.assignment.description')}
            </Label>
            <Textarea
              id='assignment-description'
              value={description}
              rows={3}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='assignment-due'>
              {t('training.assignment.dueAt')}
            </Label>
            <Input
              id='assignment-due'
              type='datetime-local'
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
            />
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-2'>
              <Label htmlFor='assignment-score'>
                {t('training.assignment.maxScore')}
              </Label>
              <Input
                id='assignment-score'
                type='number'
                min={1}
                value={maxScore}
                onChange={(event) => setMaxScore(event.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label>{t('training.assignment.statusLabel')}</Label>
              <Select
                value={status}
                onValueChange={(value) =>
                  setStatus((value as AssignmentStatus) ?? 'draft')
                }
              >
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNMENT_STATUSES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {t(ASSIGNMENT_STATUS_KEYS[item])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {action.error ? (
            <p className='text-sm text-destructive' role='alert'>
              {action.error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('actions.cancel')}
          </Button>
          <Button
            disabled={action.pending || !title.trim() || !dueAt}
            onClick={() => void submit()}
          >
            {t('actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
