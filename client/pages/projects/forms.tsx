import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import {
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { SessionExpiredAlert } from '@/components/session-expired-alert';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

import { CollaboratorPicker } from './collaborator-picker.js';
import { DeliverableFileUpload, type UploadedFile } from './file-view.js';
import {
  MEMBER_ROLES,
  TASK_PRIORITIES,
  type MemberRole,
  type Milestone,
  type Project,
  type Task,
} from './types.js';

/** The two states a form's root error can be in, translated where it renders. */
function RootError({
  error,
}: {
  readonly error: unknown;
}): ReactElement | null {
  const { t } = useTranslation();
  if (!error) return null;
  const sessionExpired =
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    (error as { type?: unknown }).type === 'sessionExpired';
  if (sessionExpired) return <SessionExpiredAlert />;
  return (
    <Alert variant='destructive'>
      <AlertCircleIcon />
      <AlertDescription>{t('projects.error.requestFailed')}</AlertDescription>
    </Alert>
  );
}

/** Maps an API failure to the message a form shows for it. */
function formErrorMessage(
  error: unknown,
  t: (key: string) => string,
): string | undefined {
  if (!(error instanceof ApiClientError))
    return t('projects.error.requestFailed');
  if (error.status === 401) return undefined;
  return error.status === 403
    ? t('projects.error.forbidden')
    : t('projects.error.requestFailed');
}

function isSessionExpired(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 401;
}

/**
 * The dialog shell every create form uses: title, description, a body form and the Cancel / submit pair. The submit
 * button lives in the footer and is linked to the form by id, so pressing Enter in the form still submits.
 */
function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  formId,
  submitting,
  submitLabel,
  disabled = false,
  children,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: string;
  readonly formId: string;
  readonly submitting: boolean;
  readonly submitLabel: string;
  readonly disabled?: boolean;
  readonly children: ReactNode;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !submitting && onOpenChange(next)}
    >
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button
            disabled={submitting}
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
          >
            {t('actions.cancel')}
          </Button>
          <Button disabled={submitting || disabled} form={formId} type='submit'>
            {submitting ? <Spinner data-icon='inline-start' /> : null}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Project ---------------------------------------------------------------

export function ProjectForm({
  formId,
  onSubmittingChange,
  onSubmitted,
  onCancel,
}: {
  readonly formId: string;
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onSubmitted: (project: Project) => void;
  readonly onCancel: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();

  const schema = useMemo(
    () =>
      z
        .object({
          name: z
            .string()
            .trim()
            .min(1, t('projects.form.nameRequired'))
            .max(200, t('projects.form.nameTooLong', { max: 200 })),
          description: z.string().trim().max(2000),
          startDate: z.string(),
          endDate: z.string(),
        })
        .refine(
          (values) =>
            !values.startDate ||
            !values.endDate ||
            values.startDate <= values.endDate,
          { path: ['endDate'], message: t('projects.form.endBeforeStart') },
        ),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '', startDate: '', endDate: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    onSubmittingChange(true);
    try {
      const result = await api.request<{ data: Project }>({
        path: 'projects',
        method: 'POST',
        json: {
          name: values.name,
          description: values.description || null,
          startDate: values.startDate || null,
          endDate: values.endDate || null,
        },
      });
      toaster.show({
        type: 'success',
        title: t('projects.create.success', { name: result.data.name }),
      });
      onSubmitted(result.data);
    } catch (error: unknown) {
      form.setError('root', {
        type: isSessionExpired(error) ? 'sessionExpired' : undefined,
        message: formErrorMessage(error, t),
      });
    } finally {
      onSubmittingChange(false);
    }
  });

  return (
    <form id={formId} noValidate onSubmit={(event) => void onSubmit(event)}>
      <FieldGroup>
        <RootError error={form.formState.errors.root} />
        <Controller
          control={form.control}
          name='name'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-name`}>
                {t('projects.fields.name')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Input
                {...field}
                aria-invalid={fieldState.invalid}
                aria-required='true'
                autoComplete='off'
                id={`${formId}-name`}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name='description'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-description`}>
                {t('projects.fields.description')}
              </FieldLabel>
              <Textarea
                {...field}
                aria-invalid={fieldState.invalid}
                id={`${formId}-description`}
                rows={3}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <div className='grid gap-4 sm:grid-cols-2'>
          <Controller
            control={form.control}
            name='startDate'
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${formId}-start`}>
                  {t('projects.fields.startDate')}
                </FieldLabel>
                {/* The native date control: its value is a plain `yyyy-mm-dd`, which is what the API stores. */}
                <Input
                  {...field}
                  aria-invalid={fieldState.invalid}
                  id={`${formId}-start`}
                  type='date'
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name='endDate'
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${formId}-end`}>
                  {t('projects.fields.endDate')}
                </FieldLabel>
                <Input
                  {...field}
                  aria-invalid={fieldState.invalid}
                  id={`${formId}-end`}
                  type='date'
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        </div>
      </FieldGroup>
      <div className='mt-4 flex justify-end gap-2'>
        <Button type='button' variant='outline' onClick={onCancel}>
          {t('actions.cancel')}
        </Button>
        <Button form={formId} type='submit'>
          {t('actions.create')}
        </Button>
      </div>
    </form>
  );
}

// --- Member ----------------------------------------------------------------

export function AddMemberDialog({
  projectId,
  excludeIds,
  open,
  onOpenChange,
  onSaved,
}: {
  readonly projectId: string;
  /** Members already on the project, left out of the picker. */
  readonly excludeIds?: readonly string[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [submitting, setSubmitting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<MemberRole>('member');

  async function submit(): Promise<void> {
    if (!userId) return;
    setSubmitting(true);
    try {
      await api.request({
        path: `projects/${encodeURIComponent(projectId)}/members`,
        method: 'POST',
        json: { userId, role },
      });
      toaster.show({ type: 'success', title: t('projects.members.added') });
      setUserId(null);
      setRole('member');
      onOpenChange(false);
      onSaved();
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      toaster.show({
        type: 'error',
        title:
          apiError?.reason === 'MEMBER_ALREADY_EXISTS'
            ? t('projects.members.exists')
            : apiError?.status === 403
              ? t('projects.error.forbidden')
              : t('projects.error.requestFailed'),
      });
    } finally {
      setSubmitting(false);
    }
  }

  const roleItems = MEMBER_ROLES.map((value) => ({
    value,
    label: t(`projects.memberRole.${value}`),
  }));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !submitting && onOpenChange(next)}
    >
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('projects.members.add')}</DialogTitle>
          <DialogDescription>{t('projects.members.addHint')}</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel>{t('projects.members.person')}</FieldLabel>
          <CollaboratorPicker
            excludeIds={excludeIds}
            placeholder={t('projects.members.personPlaceholder')}
            value={userId}
            onValueChange={setUserId}
          />
        </Field>
        <Field>
          <FieldLabel>{t('projects.members.role')}</FieldLabel>
          <Select
            items={roleItems}
            value={role}
            onValueChange={(next) => {
              if (next) setRole(next);
            }}
          >
            <SelectTrigger className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {roleItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <DialogFooter>
          <Button
            disabled={submitting}
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
          >
            {t('actions.cancel')}
          </Button>
          <Button
            disabled={submitting || !userId}
            type='button'
            onClick={() => void submit()}
          >
            {submitting ? <Spinner data-icon='inline-start' /> : null}
            {t('projects.members.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Milestone -------------------------------------------------------------

export function MilestoneDialog({
  projectId,
  open,
  onOpenChange,
  onSaved,
}: {
  readonly projectId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const formId = 'milestone-new-form';
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');

  async function submit(): Promise<void> {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await api.request({
        path: `projects/${encodeURIComponent(projectId)}/milestones`,
        method: 'POST',
        json: {
          name: name.trim(),
          dueDate: dueDate || null,
          description: description.trim() || null,
        },
      });
      toaster.show({
        type: 'success',
        title: t('projects.milestones.created'),
      });
      setName('');
      setDueDate('');
      setDescription('');
      onOpenChange(false);
      onSaved();
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      toaster.show({
        type: 'error',
        title:
          apiError?.status === 403
            ? t('projects.error.forbidden')
            : t('projects.error.requestFailed'),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialog
      description={t('projects.milestones.createHint')}
      disabled={!name.trim()}
      formId={formId}
      open={open}
      submitting={submitting}
      submitLabel={t('actions.create')}
      title={t('projects.milestones.create')}
      onOpenChange={onOpenChange}
    >
      <form
        id={formId}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`${formId}-name`}>
              {t('projects.fields.name')}
              <span aria-hidden='true' className='text-destructive'>
                *
              </span>
            </FieldLabel>
            <Input
              aria-required='true'
              id={`${formId}-name`}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${formId}-due`}>
              {t('projects.fields.dueDate')}
            </FieldLabel>
            <Input
              id={`${formId}-due`}
              type='date'
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${formId}-description`}>
              {t('projects.fields.description')}
            </FieldLabel>
            <Textarea
              id={`${formId}-description`}
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
        </FieldGroup>
      </form>
    </FormDialog>
  );
}

// --- Task ------------------------------------------------------------------

/** The values a task form starts from, for both the create and the edit case. */
function taskFormValues(task?: Task): {
  title: string;
  description: string;
  assigneeId: string;
  milestoneId: string;
  priority: Task['priority'];
  dueDate: string;
  required: boolean;
} {
  return {
    title: task?.title ?? '',
    description: task?.description ?? '',
    assigneeId: task?.assigneeId ?? '',
    milestoneId: task?.milestoneId ?? '',
    priority: task?.priority ?? 'normal',
    dueDate: task?.dueDate ?? '',
    required: task?.required ?? true,
  };
}

export function TaskDialog({
  projectId,
  milestones,
  task,
  open,
  onOpenChange,
  onSaved,
}: {
  readonly projectId: string;
  readonly milestones: readonly Milestone[];
  /** When present, the dialog edits this task; otherwise it creates one. */
  readonly task?: Task;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const formId = task ? 'task-edit-form' : 'task-new-form';

  const schema = useMemo(
    () =>
      z.object({
        title: z
          .string()
          .trim()
          .min(1, t('projects.form.titleRequired'))
          .max(200, t('projects.form.titleTooLong', { max: 200 })),
        description: z.string().trim().max(2000),
        assigneeId: z.string(),
        milestoneId: z.string(),
        priority: z.enum(TASK_PRIORITIES),
        dueDate: z.string(),
        required: z.boolean(),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: taskFormValues(task),
  });

  // The dialog stays mounted while it is closed, so `defaultValues` alone would leave it showing the values of
  // whichever task was first rendered. Reset to the task being edited (or to empty for a create) each time it opens.
  useEffect(() => {
    if (open) form.reset(taskFormValues(task));
  }, [open, task, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    const json = {
      title: values.title,
      description: values.description || null,
      assigneeId: values.assigneeId || null,
      milestoneId: values.milestoneId || null,
      priority: values.priority,
      dueDate: values.dueDate || null,
      required: values.required,
    };
    try {
      if (task) {
        await api.request({
          path: `tasks/${encodeURIComponent(task.id)}`,
          method: 'PATCH',
          json,
        });
      } else {
        await api.request({
          path: `projects/${encodeURIComponent(projectId)}/tasks`,
          method: 'POST',
          json,
        });
      }
      toaster.show({
        type: 'success',
        title: task ? t('projects.tasks.updated') : t('projects.tasks.created'),
      });
      onOpenChange(false);
      onSaved();
    } catch (error: unknown) {
      form.setError('root', {
        type: isSessionExpired(error) ? 'sessionExpired' : undefined,
        message: formErrorMessage(error, t),
      });
    }
  });

  const priorityItems = TASK_PRIORITIES.map((value) => ({
    value,
    label: t(`projects.priority.${value}`),
  }));
  const milestoneItems = [
    { value: null as string | null, label: t('projects.fields.noMilestone') },
    ...milestones.map((milestone) => ({
      value: milestone.id,
      label: milestone.name,
    })),
  ];

  return (
    <FormDialog
      description={t('projects.tasks.formHint')}
      formId={formId}
      open={open}
      submitting={form.formState.isSubmitting}
      submitLabel={task ? t('actions.save') : t('actions.create')}
      title={task ? t('projects.tasks.edit') : t('projects.tasks.create')}
      onOpenChange={onOpenChange}
    >
      <form id={formId} noValidate onSubmit={(event) => void onSubmit(event)}>
        <FieldGroup>
          <RootError error={form.formState.errors.root} />
          <Controller
            control={form.control}
            name='title'
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${formId}-title`}>
                  {t('projects.fields.title')}
                  <span aria-hidden='true' className='text-destructive'>
                    *
                  </span>
                </FieldLabel>
                <Input
                  {...field}
                  aria-invalid={fieldState.invalid}
                  aria-required='true'
                  id={`${formId}-title`}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name='description'
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${formId}-description`}>
                  {t('projects.fields.description')}
                </FieldLabel>
                <Textarea
                  {...field}
                  aria-invalid={fieldState.invalid}
                  id={`${formId}-description`}
                  rows={3}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name='assigneeId'
            render={({ field }) => (
              <Field>
                <FieldLabel>{t('projects.fields.assignee')}</FieldLabel>
                <CollaboratorPicker
                  allowNone
                  placeholder={t('projects.fields.unassigned')}
                  value={field.value || null}
                  onValueChange={(next) => field.onChange(next ?? '')}
                />
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name='milestoneId'
            render={({ field }) => (
              <Field>
                <FieldLabel>{t('projects.fields.milestone')}</FieldLabel>
                <Select
                  items={milestoneItems}
                  value={field.value || null}
                  onValueChange={(next) => field.onChange(next ?? '')}
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {milestoneItems.map((item) => (
                        <SelectItem
                          key={item.value ?? 'none'}
                          value={item.value}
                        >
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            )}
          />
          <div className='grid gap-4 sm:grid-cols-2'>
            <Controller
              control={form.control}
              name='priority'
              render={({ field }) => (
                <Field>
                  <FieldLabel>{t('projects.fields.priority')}</FieldLabel>
                  <Select
                    items={priorityItems}
                    value={field.value}
                    onValueChange={(next) => {
                      if (next) field.onChange(next);
                    }}
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {priorityItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name='dueDate'
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor={`${formId}-due`}>
                    {t('projects.fields.dueDate')}
                  </FieldLabel>
                  <Input {...field} id={`${formId}-due`} type='date' />
                </Field>
              )}
            />
          </div>
          <Controller
            control={form.control}
            name='required'
            render={({ field }) => (
              <Field orientation='horizontal'>
                <Checkbox
                  checked={field.value}
                  id={`${formId}-required`}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  onCheckedChange={(checked) => field.onChange(checked)}
                />
                <FieldLabel htmlFor={`${formId}-required`}>
                  {t('projects.fields.required')}
                </FieldLabel>
              </Field>
            )}
          />
        </FieldGroup>
      </form>
    </FormDialog>
  );
}

// --- Deliverable submission ------------------------------------------------

export function SubmitDeliverableForm({
  taskId,
  onSubmittingChange,
  onSubmitted,
  onCancel,
}: {
  readonly taskId: string;
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onSubmitted: () => void;
  readonly onCancel: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const formId = 'deliverable-new-form';
  const [file, setFile] = useState<UploadedFile | null>(null);

  const schema = useMemo(
    () =>
      z.object({
        title: z
          .string()
          .trim()
          .min(1, t('projects.form.deliverableTitleRequired'))
          .max(200, t('projects.form.titleTooLong', { max: 200 })),
        description: z.string().trim().max(2000),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { title: '', description: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    onSubmittingChange(true);
    try {
      await api.request({
        path: `tasks/${encodeURIComponent(taskId)}/deliverables`,
        method: 'POST',
        json: {
          title: values.title,
          description: values.description || null,
          fileId: file?.id ?? null,
        },
      });
      toaster.show({
        type: 'success',
        title: t('projects.deliverables.submitted'),
      });
      onSubmitted();
    } catch (error: unknown) {
      form.setError('root', {
        type: isSessionExpired(error) ? 'sessionExpired' : undefined,
        message: formErrorMessage(error, t),
      });
    } finally {
      onSubmittingChange(false);
    }
  });

  return (
    <form id={formId} noValidate onSubmit={(event) => void onSubmit(event)}>
      <FieldGroup>
        <RootError error={form.formState.errors.root} />
        <Controller
          control={form.control}
          name='title'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-title`}>
                {t('projects.fields.title')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Input
                {...field}
                aria-invalid={fieldState.invalid}
                aria-required='true'
                id={`${formId}-title`}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name='description'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-description`}>
                {t('projects.fields.description')}
              </FieldLabel>
              <Textarea
                {...field}
                aria-invalid={fieldState.invalid}
                id={`${formId}-description`}
                rows={3}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Field>
          <FieldLabel>{t('projects.fields.file')}</FieldLabel>
          <DeliverableFileUpload value={file} onChange={setFile} />
        </Field>
      </FieldGroup>
      <div className='mt-4 flex justify-end gap-2'>
        <Button type='button' variant='outline' onClick={onCancel}>
          {t('actions.cancel')}
        </Button>
        <Button form={formId} type='submit'>
          {t('projects.deliverables.submit')}
        </Button>
      </div>
    </form>
  );
}
