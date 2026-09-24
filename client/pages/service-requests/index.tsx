/**
 * Service requests — the supervisor's list screen.
 *
 * Skeleton: `PageContainer` → `PageHeader` with a create action → summary
 * `Card`s → `DataTable` of requests → `Dialog` create form. Accepting a request
 * calls the server, which runs the acceptance workflow and sends the in-app
 * message; the row is reloaded from the server afterwards rather than patched
 * locally, so the status and result on screen come from the stored record.
 */
import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { CheckIcon, EyeIcon, PlusIcon, RefreshCwIcon } from 'lucide-react';
import {
  type FormEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Link } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
  FieldDescription,
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
import { Switch } from '@/components/ui/switch';
import { Toaster, toast } from '@/components/ui/toast';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';

import {
  acceptServiceRequest,
  createServiceRequest,
  listServiceRequestAssignees,
  listServiceRequests,
  type ServiceRequest,
  type ServiceRequestAssignee,
} from './api.js';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assigneeLabel(assignee: ServiceRequestAssignee): string {
  return assignee.name || assignee.username || assignee.email;
}

const STATUS_BADGE = {
  pending: 'outline',
  accepted: 'default',
} as const;

const RESULT_BADGE = {
  urgent: 'destructive',
  normal: 'secondary',
} as const;

export default function ServiceRequestsPage(): ReactElement {
  const { t } = useTranslation();
  const client = useApiClient();

  const [requests, setRequests] = useState<readonly ServiceRequest[]>([]);
  const [assignees, setAssignees] = useState<readonly ServiceRequestAssignee[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [acceptingId, setAcceptingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const fetchData = useCallback(async () => {
    const [nextRequests, nextAssignees] = await Promise.all([
      listServiceRequests(client),
      listServiceRequestAssignees(client),
    ]);
    setRequests(nextRequests);
    setAssignees(nextAssignees);
  }, [client]);

  const load = useCallback(async () => {
    setError(undefined);
    try {
      await fetchData();
    } catch (reason) {
      setError(messageOf(reason));
    }
  }, [fetchData]);

  // The first load starts with the initial `loading` state and runs through a
  // resolved promise so the effect body never sets state synchronously.
  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(() => {
        if (active) setLoading(true);
        return load();
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);

  const assigneeNames = useMemo(
    () =>
      new Map(
        assignees.map((assignee) => [assignee.id, assigneeLabel(assignee)]),
      ),
    [assignees],
  );

  const counts = useMemo(() => {
    let pending = 0;
    let accepted = 0;
    let urgent = 0;
    for (const request of requests) {
      if (request.status === 'accepted') accepted += 1;
      else pending += 1;
      if (request.urgent) urgent += 1;
    }
    return { total: requests.length, pending, accepted, urgent };
  }, [requests]);

  const accept = useCallback(
    async (request: ServiceRequest) => {
      setAcceptingId(request.id);
      try {
        const outcome = await acceptServiceRequest(client, request.id);
        await load();
        toast.add({
          type: outcome.runFinished ? 'success' : 'warning',
          title: t('serviceRequests.acceptedToast', {
            reference: request.reference,
          }),
          description: t(
            outcome.runFinished
              ? 'serviceRequests.acceptedDescription'
              : 'serviceRequests.acceptedSlowDescription',
          ),
        });
      } catch (reason) {
        toast.add({
          type: 'error',
          title: t('serviceRequests.acceptFailed'),
          description: messageOf(reason),
        });
      } finally {
        setAcceptingId(null);
      }
    },
    [client, load, t],
  );

  const submit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const titleValue = data.get('title');
      const assigneeValue = data.get('assigneeId');
      const title = typeof titleValue === 'string' ? titleValue.trim() : '';
      const assigneeId =
        typeof assigneeValue === 'string' ? assigneeValue.trim() : '';
      if (!title || !assigneeId) {
        toast.add({
          type: 'error',
          title: t('serviceRequests.createFailed'),
          description: t('serviceRequests.missingFields'),
        });
        return;
      }
      try {
        const created = await createServiceRequest(client, {
          title,
          urgent: data.get('urgent') === 'on',
          assigneeId,
        });
        await load();
        setCreating(false);
        toast.add({
          type: 'success',
          title: t('serviceRequests.created'),
          description: created.reference,
        });
      } catch (reason) {
        toast.add({
          type: 'error',
          title: t('serviceRequests.createFailed'),
          description: messageOf(reason),
        });
      }
    },
    [client, load, t],
  );

  const columns = useMemo<ColumnDef<ServiceRequest, unknown>[]>(
    () => [
      {
        accessorKey: 'reference',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('serviceRequests.columns.reference')}
          />
        ),
        cell: ({ row }) => (
          <span className='font-mono text-xs'>{row.original.reference}</span>
        ),
      },
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('serviceRequests.columns.title')}
          />
        ),
        cell: ({ row }) => (
          <div className='flex items-center gap-2'>
            <span className='font-medium'>{row.original.title}</span>
            {row.original.urgent ? (
              <Badge variant='destructive'>{t('serviceRequests.urgent')}</Badge>
            ) : null}
          </div>
        ),
      },
      {
        id: 'assignee',
        accessorFn: (request) =>
          assigneeNames.get(request.assigneeId) ?? request.assigneeId,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('serviceRequests.columns.assignee')}
          />
        ),
        cell: ({ getValue }) => (
          <span className='text-muted-foreground'>{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: 'status',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('serviceRequests.columns.status')}
          />
        ),
        cell: ({ row }) => (
          <Badge variant={STATUS_BADGE[row.original.status]}>
            {t(`serviceRequests.status.${row.original.status}`)}
          </Badge>
        ),
      },
      {
        id: 'result',
        accessorFn: (request) => request.result ?? '',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('serviceRequests.columns.result')}
          />
        ),
        cell: ({ row }) =>
          row.original.result ? (
            <Badge variant={RESULT_BADGE[row.original.result]}>
              {t(`serviceRequests.result.${row.original.result}`)}
            </Badge>
          ) : (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('serviceRequests.columns.createdAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {format(new Date(row.original.createdAt), 'PP')}
          </span>
        ),
      },
      {
        id: 'actions',
        enableHiding: false,
        cell: ({ row }) => {
          const request = row.original;
          return (
            <div className='flex justify-end gap-2'>
              <Button
                variant='outline'
                size='sm'
                render={<Link to={`/service-requests/${request.id}`} />}
              >
                <EyeIcon data-icon='inline-start' />
                {t('serviceRequests.view')}
              </Button>
              <Button
                size='sm'
                disabled={
                  request.status === 'accepted' || acceptingId === request.id
                }
                onClick={() => void accept(request)}
              >
                <CheckIcon data-icon='inline-start' />
                {request.status === 'accepted'
                  ? t('serviceRequests.accepted')
                  : t('serviceRequests.accept')}
              </Button>
            </div>
          );
        },
      },
    ],
    [accept, acceptingId, assigneeNames, t],
  );

  return (
    <PageContainer>
      <Toaster />
      <PageHeader
        title={t('serviceRequests.title')}
        description={t('serviceRequests.description')}
        actions={
          <>
            <Button
              variant='outline'
              onClick={() => {
                setLoading(true);
                void load().finally(() => setLoading(false));
              }}
            >
              <RefreshCwIcon data-icon='inline-start' />
              {t('serviceRequests.refresh')}
            </Button>
            <Button onClick={() => setCreating(true)}>
              <PlusIcon data-icon='inline-start' />
              {t('serviceRequests.create')}
            </Button>
          </>
        }
      />

      {error ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('serviceRequests.loadFailed')}</AlertTitle>
          <AlertDescription className='flex items-center justify-between gap-3'>
            {error}
            <Button
              size='sm'
              variant='outline'
              onClick={() => {
                setLoading(true);
                void load().finally(() => setLoading(false));
              }}
            >
              {t('serviceRequests.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <Card>
          <CardHeader>
            <CardDescription>
              {t('serviceRequests.summary.total')}
            </CardDescription>
            <CardTitle className='font-heading text-2xl tabular-nums'>
              {counts.total}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>
              {t('serviceRequests.summary.pending')}
            </CardDescription>
            <CardTitle className='font-heading text-2xl tabular-nums'>
              {counts.pending}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>
              {t('serviceRequests.summary.accepted')}
            </CardDescription>
            <CardTitle className='font-heading text-2xl tabular-nums'>
              {counts.accepted}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>
              {t('serviceRequests.summary.urgent')}
            </CardDescription>
            <CardTitle className='font-heading text-2xl tabular-nums'>
              {counts.urgent}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <DataTable
        columns={columns}
        data={[...requests]}
        getRowId={(request) => String(request.id)}
        pageSize={10}
        emptyMessage={
          loading ? t('serviceRequests.loading') : t('serviceRequests.empty')
        }
        toolbar={(table) => (
          <Input
            placeholder={t('serviceRequests.searchPlaceholder')}
            value={
              (table.getColumn('title')?.getFilterValue() as
                string | undefined) ?? ''
            }
            onChange={(event) =>
              table.getColumn('title')?.setFilterValue(event.target.value)
            }
            className='max-w-xs'
          />
        )}
      />

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className='sm:max-w-md'>
          <form onSubmit={(event) => void submit(event)}>
            <DialogHeader>
              <DialogTitle>{t('serviceRequests.create')}</DialogTitle>
              <DialogDescription>
                {t('serviceRequests.createDescription')}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className='py-4'>
              <Field>
                <FieldLabel htmlFor='service-request-title'>
                  {t('serviceRequests.columns.title')}
                </FieldLabel>
                <Input
                  id='service-request-title'
                  name='title'
                  required
                  maxLength={200}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor='service-request-assignee'>
                  {t('serviceRequests.columns.assignee')}
                </FieldLabel>
                <Select name='assigneeId' required>
                  <SelectTrigger
                    id='service-request-assignee'
                    className='w-full'
                  >
                    <SelectValue
                      placeholder={t('serviceRequests.selectAssignee')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {assignees.map((assignee) => (
                      <SelectItem key={assignee.id} value={assignee.id}>
                        {assigneeLabel(assignee)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {t('serviceRequests.assigneeHint')}
                </FieldDescription>
              </Field>
              <Field orientation='horizontal'>
                <FieldLabel htmlFor='service-request-urgent'>
                  {t('serviceRequests.urgent')}
                </FieldLabel>
                <Switch id='service-request-urgent' name='urgent' />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setCreating(false)}
              >
                {t('actions.cancel')}
              </Button>
              <Button type='submit'>{t('actions.save')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
