import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { PlusIcon } from 'lucide-react';
import {
  type FormEvent,
  type ReactElement,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Link } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

import {
  createServiceRequest,
  fetchServiceRequestAssignees,
  fetchServiceRequests,
  type ServiceRequest,
  type ServiceRequestAssignee,
} from './api.js';

interface RequestsState {
  readonly key: string;
  readonly requests?: ServiceRequest[];
  readonly assignees?: ServiceRequestAssignee[];
  readonly error?: unknown;
}

/**
 * The list of service requests. A supervisor creates a request and picks its
 * assignee here; the acceptance itself runs on the request's own page, where
 * the workflow's outcome is shown.
 */
export default function ServiceRequestsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [revision, setRevision] = useState(0);
  const requestKey = String(revision);
  const [state, setState] = useState<RequestsState>();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    const key = String(revision);
    Promise.all([
      fetchServiceRequests(api, controller.signal),
      fetchServiceRequestAssignees(api, controller.signal),
    ]).then(
      ([requests, assignees]) => {
        if (!controller.signal.aborted) setState({ key, requests, assignees });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, revision]);

  const loading = state?.key !== requestKey;
  const error = loading ? undefined : state?.error;
  const requests = state?.requests ?? [];
  const assigneeNames = useMemo(
    () =>
      new Map(
        (state?.assignees ?? []).map((assignee) => [
          assignee.id,
          assignee.name,
        ]),
      ),
    [state?.assignees],
  );

  const columns = useMemo<ColumnDef<ServiceRequest>[]>(
    () => [
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('serviceRequest.columns.title')}
          />
        ),
        cell: ({ row }) => (
          <Link
            className='rounded-sm font-medium hover:underline underline-offset-4'
            to={`/service-requests/${String(row.original.id)}`}
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        accessorKey: 'urgent',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('serviceRequest.columns.priority')}
          />
        ),
        cell: ({ row }) => (
          <Badge variant={row.original.urgent ? 'destructive' : 'secondary'}>
            {row.original.urgent
              ? t('serviceRequest.priority.urgent')
              : t('serviceRequest.priority.normal')}
          </Badge>
        ),
      },
      {
        accessorKey: 'assigneeId',
        enableSorting: false,
        header: () => t('serviceRequest.columns.assignee'),
        cell: ({ row }) =>
          assigneeNames.get(row.original.assigneeId) ?? row.original.assigneeId,
      },
      {
        accessorKey: 'status',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('serviceRequest.columns.status')}
          />
        ),
        cell: ({ row }) => (
          <Badge
            variant={row.original.status === 'accepted' ? 'default' : 'outline'}
          >
            {t(`serviceRequest.status.${row.original.status}`, {
              defaultValue: row.original.status,
            })}
          </Badge>
        ),
      },
      {
        accessorKey: 'result',
        header: () => t('serviceRequest.columns.result'),
        cell: ({ row }) =>
          row.original.result
            ? t(`serviceRequest.result.${row.original.result}`, {
                defaultValue: row.original.result,
              })
            : t('serviceRequest.result.none'),
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('serviceRequest.columns.createdAt')}
          />
        ),
        cell: ({ row }) => new Date(row.original.createdAt).toLocaleString(),
      },
    ],
    [assigneeNames, t],
  );

  function openCreate(): void {
    setTitle('');
    setUrgent(false);
    setAssigneeId(null);
    setSubmitError(undefined);
    setCreating(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || !assigneeId) {
      setSubmitError(t('serviceRequest.createFailed'));
      return;
    }
    setSubmitting(true);
    setSubmitError(undefined);
    try {
      await createServiceRequest(api, {
        title: trimmed,
        urgent,
        assigneeId,
      });
      setCreating(false);
      setRevision((value) => value + 1);
    } catch (reason) {
      setSubmitError(
        reason instanceof ApiClientError && reason.message
          ? reason.message
          : t('serviceRequest.createFailed'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('serviceRequest.title')}
        description={t('serviceRequest.description')}
        actions={
          <Button onClick={openCreate}>
            <PlusIcon data-icon='inline-start' />
            {t('serviceRequest.newRequest')}
          </Button>
        }
      />

      {error ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('serviceRequest.loadFailed')}</AlertTitle>
          <AlertDescription className='flex items-center justify-between gap-3'>
            {error instanceof Error ? error.message : undefined}
            <Button
              size='sm'
              variant='outline'
              onClick={() => setRevision((value) => value + 1)}
            >
              {t('serviceRequest.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <DataTable
        columns={columns}
        data={requests}
        emptyMessage={t('serviceRequest.empty')}
      />

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className='sm:max-w-md'>
          <form onSubmit={(event) => void submit(event)}>
            <DialogHeader>
              <DialogTitle>{t('serviceRequest.newRequest')}</DialogTitle>
              <DialogDescription>
                {t('serviceRequest.newRequestDescription')}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className='py-4'>
              <Field>
                <FieldLabel htmlFor='service-request-title'>
                  {t('serviceRequest.requestTitle')}
                </FieldLabel>
                <Input
                  id='service-request-title'
                  value={title}
                  placeholder={t('serviceRequest.requestTitlePlaceholder')}
                  required
                  onChange={(event) => setTitle(event.target.value)}
                />
              </Field>
              <Field orientation='horizontal'>
                <div className='flex flex-col gap-1'>
                  <FieldLabel htmlFor='service-request-urgent'>
                    {t('serviceRequest.urgent')}
                  </FieldLabel>
                  <span className='text-xs text-muted-foreground'>
                    {t('serviceRequest.urgentHint')}
                  </span>
                </div>
                <Switch
                  id='service-request-urgent'
                  checked={urgent}
                  onCheckedChange={setUrgent}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor='service-request-assignee'>
                  {t('serviceRequest.assignee')}
                </FieldLabel>
                <Select
                  value={assigneeId}
                  onValueChange={(value: string | null) => setAssigneeId(value)}
                >
                  <SelectTrigger
                    id='service-request-assignee'
                    className='w-full'
                  >
                    <SelectValue
                      placeholder={t('serviceRequest.assigneePlaceholder')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(state?.assignees ?? []).map((assignee) => (
                      <SelectItem key={assignee.id} value={assignee.id}>
                        {assignee.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {submitError ? (
                <Alert variant='destructive'>
                  <AlertDescription>{submitError}</AlertDescription>
                </Alert>
              ) : null}
            </FieldGroup>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setCreating(false)}
              >
                {t('actions.cancel')}
              </Button>
              <Button type='submit' disabled={submitting}>
                {submitting
                  ? t('serviceRequest.creating')
                  : t('serviceRequest.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
