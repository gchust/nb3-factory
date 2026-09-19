import { useTranslation } from '@nocobase/i18n/client';
import { Pencil, Plus } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';

import { useTrainingAction, useTrainingQuery } from '../client.js';
import {
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  StatusFor,
} from '../components.js';
import {
  COURSE_STATUSES,
  COURSE_STATUS_KEYS,
  type CourseStatus,
  type CourseSummary,
} from '../types.js';

export default function TrainingManageCoursesPage(): ReactElement {
  const { t } = useTranslation();
  const courses = useTrainingQuery<CourseSummary[]>('training/courses');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CourseSummary | null>(null);

  return (
    <div className='space-y-4'>
      <div className='flex justify-end'>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className='size-4' aria-hidden />
          {t('training.manage.courses.create')}
        </Button>
      </div>

      {courses.loading ? <LoadingBlock /> : null}
      {courses.error ? (
        <ErrorBlock message={courses.error} onRetry={courses.reload} />
      ) : null}
      {!courses.loading &&
      !courses.error &&
      (courses.data?.length ?? 0) === 0 ? (
        <EmptyBlock message={t('training.manage.courses.empty')} />
      ) : null}

      {(courses.data?.length ?? 0) > 0 ? (
        <div className='rounded-xl border border-border bg-card'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('training.manage.courses.code')}</TableHead>
                <TableHead>{t('training.manage.courses.name')}</TableHead>
                <TableHead>{t('training.manage.courses.category')}</TableHead>
                <TableHead>{t('training.manage.courses.level')}</TableHead>
                <TableHead>{t('training.manage.courses.status')}</TableHead>
                <TableHead>{t('training.manage.courses.sessions')}</TableHead>
                <TableHead className='text-right'>
                  {t('training.manage.courses.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(courses.data ?? []).map((course) => (
                <TableRow key={course.id}>
                  <TableCell className='font-mono text-xs'>
                    {course.code}
                  </TableCell>
                  <TableCell>{course.title}</TableCell>
                  <TableCell>{course.category}</TableCell>
                  <TableCell>{course.level}</TableCell>
                  <TableCell>
                    <StatusFor
                      labelKey={COURSE_STATUS_KEYS[course.status]}
                      tone={course.status === 'published' ? 'success' : 'muted'}
                    />
                  </TableCell>
                  <TableCell>{course.sessionCount}</TableCell>
                  <TableCell className='text-right'>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => setEditing(course)}
                    >
                      <Pencil className='size-4' aria-hidden />
                      {t('training.manage.edit')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <CourseFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={courses.reload}
      />
      {editing ? (
        <CourseFormDialog
          open={editing !== null}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          course={editing}
          onSaved={() => {
            setEditing(null);
            courses.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function CourseFormDialog({
  open,
  onOpenChange,
  course,
  onSaved,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly course?: CourseSummary;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const action = useTrainingAction();
  const [code, setCode] = useState(course?.code ?? '');
  const [title, setTitle] = useState(course?.title ?? '');
  const [description, setDescription] = useState(course?.description ?? '');
  const [category, setCategory] = useState(course?.category ?? '通用');
  const [level, setLevel] = useState(course?.level ?? '入门');
  const [status, setStatus] = useState<CourseStatus>(course?.status ?? 'draft');

  const submit = async (): Promise<void> => {
    const result = await action.run((client) =>
      course
        ? client.request({
            path: `training/courses/${course.id}`,
            method: 'PATCH',
            json: { title, description, category, level, status },
          })
        : client.request({
            path: 'training/courses',
            method: 'POST',
            json: { code, title, description, category, level, status },
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
            {course
              ? t('training.manage.courses.edit')
              : t('training.manage.courses.create')}
          </DialogTitle>
          <DialogDescription>
            {t('training.manage.courses.formHint')}
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-3'>
          {!course ? (
            <div className='space-y-2'>
              <Label htmlFor='course-code'>
                {t('training.manage.courses.code')}
              </Label>
              <Input
                id='course-code'
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </div>
          ) : null}
          <div className='space-y-2'>
            <Label htmlFor='course-title'>
              {t('training.manage.courses.name')}
            </Label>
            <Input
              id='course-title'
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='course-description'>
              {t('training.manage.courses.description')}
            </Label>
            <Textarea
              id='course-description'
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-2'>
              <Label htmlFor='course-category'>
                {t('training.manage.courses.category')}
              </Label>
              <Input
                id='course-category'
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='course-level'>
                {t('training.manage.courses.level')}
              </Label>
              <Input
                id='course-level'
                value={level}
                onChange={(event) => setLevel(event.target.value)}
              />
            </div>
          </div>
          <div className='space-y-2'>
            <Label>{t('training.manage.courses.status')}</Label>
            <Select
              value={status}
              onValueChange={(value) =>
                setStatus((value as CourseStatus) ?? 'draft')
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COURSE_STATUSES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {t(COURSE_STATUS_KEYS[item])}
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
              action.pending || !title.trim() || (!course && !code.trim())
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
