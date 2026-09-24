/**
 * Service requests — the acceptance list screen.
 *
 * Pattern: `PageHeader` with the primary "New request" button → a `DataTable`
 * of requests (title link to the detail drawer, urgent flag, assignee, status,
 * result, created time) → the create `Dialog` → the child-route `<Outlet />`
 * where the detail drawer mounts. Accepting a row runs the application's
 * `service-request-acceptance` workflow through the server route; the assignee
 * receives the durable in-app message the workflow sends.
 *
 * Scope note: this screen stays deliberately small. There is no search, no
 * pagination of its own and no row selection — the acceptance exercise has two
 * accounts and two requests, and every extra control is a place for the
 * workflow + in-app notification behaviour to be obscured.
 */
import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircleIcon,
  InboxIcon,
  PlusIcon,
  RefreshCwIcon,
} from 'lucide-react';
import {
  type FormEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import { Link, Outlet } from 'react-router';

import { DataTable } from '@/components/data-table';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Toaster, toast } from '@/components/ui/toast';

import {
  type ServiceRequest,
  type ServiceRequestAssignee,
  type ServiceRequestsOutletContext,
} from './types.js';
import { waitForAcceptance } from './acceptance.js';
import {
  ServiceRequestResultBadge,
  ServiceRequestStatusBadge,
} from './status-badge.js';

interface ServiceRequestsResult {
  readonly key: string;
  readonly rows?: ServiceRequest[];
  readonly assignees?: ServiceRequestAssignee[];
  readonly error?: unknown;
}

const LOADING_ROWS = ['first', 'second', 'third'] as const;

export default function ServiceRequestsPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = String(reloadCount);
  const [result, setResult] = useState<ServiceRequestsResult>();
  const [acceptingId, setAcceptingId] = useState<number | null>(null);

  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newUrgent, setNewUrgent] = useState(false);
  const [newAssignee, setNewAssignee] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [titleError, setTitleError] = useState(false);
  const [createError, setCreateError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const key = String(reloadCount);
    Promise.all([
      api.request<{ data: ServiceRequest[] }>({
        path: 'service-requests',
        signal: controller.signal,
      }),
      api.request<{ data: ServiceRequestAssignee[] }>({
        path: 'service-requests/assignees',
        signal: controller.signal,
      }),
    ]).then(
      ([requests, assignees]) => {
        if (!controller.signal.aborted) {
          setResult({ key, rows: requests.data, assignees: assignees.data });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const rows = result?.rows;
  const assignees = useMemo(() => result?.assignees ?? [], [result?.assignees]);
  const assigneeNames = useMemo(
    () => new Map(assignees.map((assignee) => [assignee.id, assignee.name])),
    [assignees],
  );
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );

  const accept = useCallback(
    async (request: ServiceRequest): Promise<void> => {
      setAcceptingId(request.id);
      try {
        await api.request({
          path: `service-requests/${request.id}/accept`,
          method: 'POST',
        });
        // The workflow runs asynchronously; wait for the record to leave
        // `processing` before refreshing so the list shows the final result.
        await waitForAcceptance(api, request.id);
        toast.add({
          type: 'success',
          title: t('serviceRequests.accepted'),
          description: request.title,
        });
        reload();
      } catch (reason) {
        // The endpoint's own message is not shown: it is server wording and can
        // name internals. The status is what the user can act on.
        toast.add({
          type: 'error',
          title: t('serviceRequests.acceptFailed'),
          description:
            reason instanceof ApiClientError && reason.status === 403
              ? t('serviceRequests.acceptForbidden')
              : t('serviceRequests.acceptFailedDescription'),
        });
      } finally {
        setAcceptingId(null);
      }
    },
    [api, reload, t],
  );

  const submit = useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      const title = newTitle.trim();
      if (!title) {
        setTitleError(true);
        return;
      }
      if (submitting) return;
      setSubmitting(true);
      setCreateError(false);
      try {
        await api.request({
          path: 'service-requests',
          method: 'POST',
          json: {
            title,
            urgent: newUrgent,
            assigneeId: newAssignee || null,
          },
        });
        toast.add({
          type: 'success',
          title: t('serviceRequests.created'),
          description: title,
        });
        setCreating(false);
        setNewTitle('');
        setNewUrgent(false);
        setNewAssignee('');
        reload();
      } catch {
        // A request made from inside a dialog reports its failure in the
        // dialog, which stays open with the input intact (guideline I3/T3.6).
        setCreateError(true);
      } finally {
        setSubmitting(false);
      }
    },
    [api, newAssignee, newTitle, newUrgent, reload, submitting, t],
  );

  const columns = useMemo<ColumnDef<ServiceRequest>[]>(
    () => [
      {
        accessorKey: 'title',
        header: t('serviceRequests.columns.title'),
        enableHiding: false,
        cell: ({ row }) => (
          <Link
            className='font-medium underline-offset-4 hover:underline'
            to={String(row.original.id)}
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        accessorKey: 'urgent',
        header: t('serviceRequests.columns.urgent'),
        cell: ({ row }) =>
          row.original.urgent ? (
            <Badge variant='destructive'>{t('serviceRequests.urgent')}</Badge>
          ) : (
            <span className='text-muted-foreground'>
              {t('serviceRequests.normal')}
            </span>
          ),
      },
      {
        accessorKey: 'assigneeId',
        header: t('serviceRequests.columns.assignee'),
        cell: ({ row }) => {
          const name = row.original.assigneeId
            ? assigneeNames.get(row.original.assigneeId)
            : undefined;
          return name ? (
            <span>{name}</span>
          ) : (
            <span className='text-muted-foreground'>—</span>
          );
        },
      },
      {
        accessorKey: 'status',
        header: t('serviceRequests.columns.status'),
        cell: ({ row }) => (
          <ServiceRequestStatusBadge status={row.original.status} />
        ),
      },
      {
        accessorKey: 'result',
        header: t('serviceRequests.columns.result'),
        cell: ({ row }) => (
          <ServiceRequestResultBadge result={row.original.result} />
        ),
      },
      {
        accessorKey: 'createdAt',
        header: t('serviceRequests.columns.createdAt'),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {dateFormat.format(new Date(row.original.createdAt))}
          </span>
        ),
      },
      {
        id: 'actions',
        enableHiding: false,
        header: () => (
          <span className='sr-only'>
            {t('serviceRequests.columns.actions')}
          </span>
        ),
        cell: ({ row }) => (
          <div className='flex justify-end'>
            {row.original.status === 'pending' ? (
              <Button
                disabled={acceptingId !== null}
                size='sm'
                variant='outline'
                onClick={() => void accept(row.original)}
              >
                {acceptingId === row.original.id ? (
                  <Spinner data-icon='inline-start' />
                ) : null}
                {t('serviceRequests.accept')}
              </Button>
            ) : (
              <span className='text-muted-foreground'>—</span>
            )}
          </div>
        ),
      },
    ],
    [accept, acceptingId, assigneeNames, dateFormat, t],
  );

  const outletContext = useMemo<ServiceRequestsOutletContext>(
    () => ({ reload }),
    [],
  );
  const openCreate = useCallback(() => {
    setTitleError(false);
    setCreateError(false);
    setCreating(true);
  }, []);

  let content: ReactElement;
  if (error) {
    const forbidden = error instanceof ApiClientError && error.status === 403;
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('serviceRequests.error.title')}</AlertTitle>
        <AlertDescription>
          <span>
            {forbidden
              ? t('serviceRequests.error.forbidden')
              : t('serviceRequests.error.requestFailed')}
          </span>
          {forbidden ? null : (
            <AlertAction>
              <Button size='sm' variant='outline' onClick={reload}>
                <RefreshCwIcon data-icon='inline-start' />
                {t('status.retry')}
              </Button>
            </AlertAction>
          )}
        </AlertDescription>
      </Alert>
    );
  } else if (rows === undefined) {
    content = (
      <div aria-label={t('status.loading')} className='space-y-3' role='status'>
        {LOADING_ROWS.map((row) => (
          <Skeleton key={row} className='h-10 w-full' />
        ))}
      </div>
    );
  } else if (rows.length === 0) {
    content = (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <InboxIcon />
          </EmptyMedia>
          <EmptyTitle>{t('serviceRequests.empty.title')}</EmptyTitle>
          <EmptyDescription>
            {t('serviceRequests.empty.description')}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant='outline' onClick={openCreate}>
            <PlusIcon data-icon='inline-start' />
            {t('serviceRequests.newRequest')}
          </Button>
        </EmptyContent>
      </Empty>
    );
  } else {
    content = (
      <DataTable
        columns={columns}
        data={rows}
        emptyMessage={t('serviceRequests.empty.title')}
        getRowId={(row) => String(row.id)}
        showSelectedCount={false}
      />
    );
  }

  return (
    <PageContainer>
      <Toaster />
      <PageHeader
        actions={
          <>
            {loading && rows !== undefined ? (
              <Spinner aria-label={t('status.loading')} />
            ) : null}
            <Button onClick={openCreate}>
              <PlusIcon data-icon='inline-start' />
              {t('serviceRequests.newRequest')}
            </Button>
          </>
        }
        description={t('serviceRequests.description')}
        title={t('serviceRequests.title')}
      />

      {content}

      <Dialog
        open={creating}
        onOpenChange={(open) => {
          if (!open && !submitting) {
            setCreateError(false);
            setCreating(false);
          }
        }}
      >
        <DialogContent className='sm:max-w-md'>
          <form noValidate onSubmit={(event) => void submit(event)}>
            <DialogHeader>
              <DialogTitle>{t('serviceRequests.newRequest')}</DialogTitle>
              <DialogDescription>
                {t('serviceRequests.newRequestDescription')}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className='py-4'>
              {createError ? (
                <Alert variant='destructive'>
                  <AlertCircleIcon />
                  <AlertTitle>{t('serviceRequests.createFailed')}</AlertTitle>
                  <AlertDescription>
                    {t('serviceRequests.createFailedDescription')}
                  </AlertDescription>
                </Alert>
              ) : null}
              <Field data-invalid={titleError ? true : undefined}>
                <FieldLabel htmlFor='service-request-title'>
                  {t('serviceRequests.columns.title')}
                  <span aria-hidden='true' className='text-destructive'>
                    *
                  </span>
                </FieldLabel>
                <Input
                  aria-invalid={titleError ? true : undefined}
                  aria-required='true'
                  id='service-request-title'
                  value={newTitle}
                  onBlur={() => setTitleError(newTitle.trim().length === 0)}
                  onChange={(event) => {
                    setNewTitle(event.target.value);
                    if (event.target.value.trim()) setTitleError(false);
                  }}
                />
                <FieldError>
                  {titleError ? t('serviceRequests.titleRequired') : null}
                </FieldError>
              </Field>
              <Field>
                <FieldLabel htmlFor='service-request-assignee'>
                  {t('serviceRequests.columns.assignee')}
                </FieldLabel>
                <Select
                  value={newAssignee}
                  onValueChange={(value) => setNewAssignee(value ?? '')}
                >
                  <SelectTrigger
                    className='w-full'
                    id='service-request-assignee'
                  >
                    <SelectValue
                      placeholder={t('serviceRequests.assigneePlaceholder')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {assignees.map((assignee) => (
                      <SelectItem key={assignee.id} value={assignee.id}>
                        {assignee.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field orientation='horizontal'>
                <Switch
                  id='service-request-urgent'
                  checked={newUrgent}
                  onCheckedChange={setNewUrgent}
                />
                <FieldLabel htmlFor='service-request-urgent'>
                  {t('serviceRequests.columns.urgent')}
                </FieldLabel>
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                disabled={submitting}
                type='button'
                variant='outline'
                onClick={() => {
                  setCreateError(false);
                  setCreating(false);
                }}
              >
                {t('actions.cancel')}
              </Button>
              <Button disabled={submitting} type='submit'>
                {submitting ? <Spinner data-icon='inline-start' /> : null}
                {t('actions.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* The detail drawer is a child route and renders here. */}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}
