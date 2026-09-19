import { useTranslation } from '@nocobase/i18n/client';
import { Pencil, Plus, UserPlus, X } from 'lucide-react';
import { useState, type ReactElement } from 'react';

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

import { useTrainingAction, useTrainingQuery } from '../client.js';
import {
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  StatusFor,
} from '../components.js';
import {
  SESSION_STATUSES,
  SESSION_STATUS_KEYS,
  formatDateTime,
  fromDateTimeLocal,
  toDateTimeLocal,
  type CourseSummary,
  type LearningSession,
  type SessionDetail,
  type SessionStatus,
  type TrainingUserOption,
} from '../types.js';

export default function TrainingManageSessionsPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const sessions = useTrainingQuery<LearningSession[]>('training/my-learning');
  const courses = useTrainingQuery<CourseSummary[]>('training/courses');
  const instructors = useTrainingQuery<TrainingUserOption[]>('training/users', {
    role: 'training-instructor',
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<LearningSession | null>(null);
  const [enrolling, setEnrolling] = useState<LearningSession | null>(null);

  const courseOptions = courses.data ?? [];
  const instructorOptions = instructors.data ?? [];

  return (
    <div className='space-y-4'>
      <div className='flex justify-end'>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className='size-4' aria-hidden />
          {t('training.manage.sessions.create')}
        </Button>
      </div>

      {sessions.loading ? <LoadingBlock /> : null}
      {sessions.error ? (
        <ErrorBlock message={sessions.error} onRetry={sessions.reload} />
      ) : null}
      {!sessions.loading &&
      !sessions.error &&
      (sessions.data?.length ?? 0) === 0 ? (
        <EmptyBlock message={t('training.manage.sessions.empty')} />
      ) : null}

      {(sessions.data?.length ?? 0) > 0 ? (
        <div className='rounded-xl border border-border bg-card'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('training.manage.sessions.code')}</TableHead>
                <TableHead>{t('training.manage.sessions.name')}</TableHead>
                <TableHead>{t('training.manage.sessions.course')}</TableHead>
                <TableHead>
                  {t('training.manage.sessions.instructor')}
                </TableHead>
                <TableHead>{t('training.manage.sessions.schedule')}</TableHead>
                <TableHead>{t('training.manage.sessions.enrolled')}</TableHead>
                <TableHead>{t('training.manage.sessions.status')}</TableHead>
                <TableHead className='text-right'>
                  {t('training.manage.sessions.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(sessions.data ?? []).map((session) => (
                <TableRow key={session.id}>
                  <TableCell className='font-mono text-xs'>
                    {session.code}
                  </TableCell>
                  <TableCell>{session.title}</TableCell>
                  <TableCell>{session.courseTitle}</TableCell>
                  <TableCell>{session.instructorName}</TableCell>
                  <TableCell className='text-xs text-muted-foreground'>
                    {formatDateTime(session.startAt, i18n.language)}
                    <br />
                    {formatDateTime(session.endAt, i18n.language)}
                  </TableCell>
                  <TableCell>
                    {session.enrolledCount}/{session.capacity}
                  </TableCell>
                  <TableCell>
                    <StatusFor
                      labelKey={SESSION_STATUS_KEYS[session.status]}
                      tone={
                        session.status === 'completed' ? 'success' : 'muted'
                      }
                    />
                  </TableCell>
                  <TableCell className='text-right'>
                    <div className='flex justify-end gap-2'>
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() => setEnrolling(session)}
                      >
                        <UserPlus className='size-4' aria-hidden />
                        {t('training.manage.sessions.enroll')}
                      </Button>
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() => setEditing(session)}
                      >
                        <Pencil className='size-4' aria-hidden />
                        {t('training.manage.edit')}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <SessionFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        courseOptions={courseOptions}
        instructorOptions={instructorOptions}
        onSaved={sessions.reload}
      />
      {editing ? (
        <SessionFormDialog
          open={editing !== null}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          session={editing}
          courseOptions={courseOptions}
          instructorOptions={instructorOptions}
          onSaved={() => {
            setEditing(null);
            sessions.reload();
          }}
        />
      ) : null}
      {enrolling ? (
        <EnrollmentDialog
          session={enrolling}
          onOpenChange={(open) => {
            if (!open) setEnrolling(null);
          }}
          onSaved={sessions.reload}
        />
      ) : null}
    </div>
  );
}

function SessionFormDialog({
  open,
  onOpenChange,
  session,
  courseOptions,
  instructorOptions,
  onSaved,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly session?: LearningSession;
  readonly courseOptions: readonly CourseSummary[];
  readonly instructorOptions: readonly TrainingUserOption[];
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const action = useTrainingAction();
  const [code, setCode] = useState(session?.code ?? '');
  const [courseId, setCourseId] = useState(
    String(session?.courseId ?? courseOptions[0]?.id ?? ''),
  );
  const [title, setTitle] = useState(session?.title ?? '');
  const [instructorId, setInstructorId] = useState(
    session?.instructorId ?? instructorOptions[0]?.id ?? '',
  );
  const [startAt, setStartAt] = useState(() =>
    toDateTimeLocal(session?.startAt),
  );
  const [endAt, setEndAt] = useState(() => toDateTimeLocal(session?.endAt));
  const [capacity, setCapacity] = useState(String(session?.capacity ?? 30));
  const [location, setLocation] = useState(session?.location ?? '');
  const [status, setStatus] = useState<SessionStatus>(
    session?.status ?? 'planned',
  );

  const courseItems = courseOptions.map((course) => ({
    value: String(course.id),
    label: `${course.code} · ${course.title}`,
  }));
  const instructorItems = instructorOptions.map((user) => ({
    value: user.id,
    label: user.name,
  }));

  const submit = async (): Promise<void> => {
    const result = await action.run((client) =>
      session
        ? client.request({
            path: `training/sessions/${session.id}`,
            method: 'PATCH',
            json: {
              title,
              instructorId,
              startAt: fromDateTimeLocal(startAt),
              endAt: fromDateTimeLocal(endAt),
              capacity: Number(capacity),
              location,
              status,
            },
          })
        : client.request({
            path: 'training/sessions',
            method: 'POST',
            json: {
              code,
              courseId: Number(courseId),
              title,
              instructorId,
              startAt: fromDateTimeLocal(startAt),
              endAt: fromDateTimeLocal(endAt),
              capacity: Number(capacity),
              location,
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
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>
            {session
              ? t('training.manage.sessions.edit')
              : t('training.manage.sessions.create')}
          </DialogTitle>
          <DialogDescription>
            {t('training.manage.sessions.formHint')}
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-3'>
          {!session ? (
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-2'>
                <Label htmlFor='session-code'>
                  {t('training.manage.sessions.code')}
                </Label>
                <Input
                  id='session-code'
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
              </div>
              <div className='space-y-2'>
                <Label>{t('training.manage.sessions.course')}</Label>
                <Select
                  value={courseId}
                  items={courseItems}
                  onValueChange={(value) => setCourseId(String(value ?? ''))}
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {courseItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
          <div className='space-y-2'>
            <Label htmlFor='session-title'>
              {t('training.manage.sessions.name')}
            </Label>
            <Input
              id='session-title'
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label>{t('training.manage.sessions.instructor')}</Label>
            <Select
              value={instructorId}
              items={instructorItems}
              onValueChange={(value) => setInstructorId(String(value ?? ''))}
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {instructorItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-2'>
              <Label htmlFor='session-start'>
                {t('training.manage.sessions.startAt')}
              </Label>
              <Input
                id='session-start'
                type='datetime-local'
                value={startAt}
                onChange={(event) => setStartAt(event.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='session-end'>
                {t('training.manage.sessions.endAt')}
              </Label>
              <Input
                id='session-end'
                type='datetime-local'
                value={endAt}
                onChange={(event) => setEndAt(event.target.value)}
              />
            </div>
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-2'>
              <Label htmlFor='session-capacity'>
                {t('training.manage.sessions.capacity')}
              </Label>
              <Input
                id='session-capacity'
                type='number'
                min={1}
                value={capacity}
                onChange={(event) => setCapacity(event.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='session-location'>
                {t('training.manage.sessions.location')}
              </Label>
              <Input
                id='session-location'
                value={location}
                onChange={(event) => setLocation(event.target.value)}
              />
            </div>
          </div>
          <div className='space-y-2'>
            <Label>{t('training.manage.sessions.status')}</Label>
            <Select
              value={status}
              onValueChange={(value) =>
                setStatus((value as SessionStatus) ?? 'planned')
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SESSION_STATUSES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {t(SESSION_STATUS_KEYS[item])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            disabled={
              action.pending ||
              !title.trim() ||
              !instructorId ||
              (!session && (!code.trim() || !courseId))
            }
            onClick={() => void submit()}
          >
            {t('actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EnrollmentDialog({
  session,
  onOpenChange,
  onSaved,
}: {
  readonly session: LearningSession;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const detail = useTrainingQuery<SessionDetail>(
    `training/sessions/${session.id}`,
  );
  const students = useTrainingQuery<TrainingUserOption[]>('training/users', {
    role: 'training-student',
  });
  const action = useTrainingAction();
  const [studentId, setStudentId] = useState('');
  const roster = detail.data?.roster ?? [];
  const enrolledIds = new Set(roster.map((item) => item.studentId));
  const available = (students.data ?? []).filter(
    (student) => !enrolledIds.has(student.id),
  );
  const studentItems = available.map((student) => ({
    value: student.id,
    label: `${student.name} (${student.username})`,
  }));

  const add = async (): Promise<void> => {
    if (!studentId) return;
    const result = await action.run((client) =>
      client.request({
        path: `training/sessions/${session.id}/enrollments`,
        method: 'POST',
        json: { studentId },
      }),
    );
    if (result !== undefined) {
      setStudentId('');
      detail.reload();
      onSaved();
    }
  };

  const remove = async (id: string): Promise<void> => {
    const result = await action.run((client) =>
      client.request({
        path: `training/sessions/${session.id}/enrollments/${encodeURIComponent(id)}`,
        method: 'DELETE',
      }),
    );
    if (result !== undefined) {
      detail.reload();
      onSaved();
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{t('training.manage.enroll.title')}</DialogTitle>
          <DialogDescription>{session.title}</DialogDescription>
        </DialogHeader>
        <div className='space-y-4'>
          <div className='flex items-end gap-2'>
            <div className='flex-1 space-y-2'>
              <Label>{t('training.manage.enroll.student')}</Label>
              <Select
                value={studentId}
                items={studentItems}
                onValueChange={(value) => setStudentId(String(value ?? ''))}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue
                    placeholder={t('training.manage.enroll.selectStudent')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {studentItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={action.pending || !studentId}
              onClick={() => void add()}
            >
              <Plus className='size-4' aria-hidden />
              {t('training.manage.enroll.add')}
            </Button>
          </div>

          {detail.loading ? <LoadingBlock /> : null}
          {detail.error ? (
            <ErrorBlock message={detail.error} onRetry={detail.reload} />
          ) : null}
          {!detail.loading && roster.length === 0 ? (
            <EmptyBlock message={t('training.manage.enroll.empty')} />
          ) : null}
          {roster.length > 0 ? (
            <ul className='space-y-2'>
              {roster.map((student) => (
                <li
                  key={student.studentId}
                  className='flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm'
                >
                  <span>
                    {student.studentName}
                    <span className='ml-2 font-mono text-xs text-muted-foreground'>
                      {student.studentId}
                    </span>
                  </span>
                  <Button
                    size='icon-sm'
                    variant='ghost'
                    aria-label={t('training.manage.enroll.remove')}
                    onClick={() => void remove(student.studentId)}
                  >
                    <X className='size-4' aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}

          {action.error ? (
            <p className='text-sm text-destructive' role='alert'>
              {action.error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('actions.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
