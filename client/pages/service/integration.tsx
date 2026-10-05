/**
 * Device-platform integration — the external side of the collaboration.
 *
 * The device platform reports a fault over HTTP; the application turns it into a
 * work order through the same acceptance path a manual entry uses. This page
 * states whether each collaborating subsystem is actually wired (the knowledge
 * index, notifications and the workflow engine), lists what the platform has
 * sent, and documents the contract the integration account calls.
 *
 * Running the scheduled inspection plans is a supervisor's job and lives on the
 * inspections page, which owns the plans and their execution records.
 *
 * The API key the contract below sends is issued for the integration account
 * from this page: a supervisor creates and revokes it here, and the secret is
 * shown once. A key created on a supervisor's own API Keys settings page would
 * authenticate as that supervisor, whose account holds no `service-integrator`
 * role, so the external endpoint would reject it — the key has to belong to the
 * integration account itself. Dynamic revocation and the read-only follow-up
 * (`GET /api/service/external/repairs/:id`) are part of the same contract.
 */
import {
  type FormEvent,
  type ReactElement,
  useCallback,
  useState,
} from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import {
  CheckCircle2Icon,
  KeyRoundIcon,
  PlusIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UploadIcon,
} from 'lucide-react';
import { Link } from 'react-router';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
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
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
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

import { useServiceApi, type ServiceList } from './api.js';
import { formText, formatDateTime, useLoad } from './data.js';
import {
  EmptyState,
  LoadFailure,
  Loading,
  Pagination,
  ServicePage,
  StatusBadge,
} from './parts.js';
import type {
  ApiKeyView,
  ExternalEventView,
  IntegrationAccountStateView,
  IntegrationView,
  MeView,
} from './types.js';

const EVENT_STATUSES = ['received', 'duplicate', 'accepted', 'rejected'];

export default function IntegrationPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [simulating, setSimulating] = useState(false);
  const [creatingKey, setCreatingKey] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<ApiKeyView | null>(null);

  const me = useLoad(useCallback(() => api.get<MeView>('/me'), [api]));
  const isManager = me.data?.roles.includes('manager') ?? false;

  const overall = useLoad(
    useCallback(() => api.get<IntegrationView>('/integration'), [api]),
  );

  // Key management is a supervisor responsibility: only a manager sees the
  // account card, and only a manager may issue or revoke a key. The endpoint
  // enforces the same rule, so hiding the card is convenience, not security.
  const account = useLoad(
    useCallback(
      () =>
        isManager
          ? api.get<IntegrationAccountStateView>('/integration/account')
          : Promise.resolve(null),
      [api, isManager],
    ),
  );

  // Revoking closes the confirmation itself on success and surfaces a failure
  // as a toast without losing the dialog.
  const revokeKey = async () => {
    const key = revoking;
    if (!key) return;
    try {
      await api.del(`/integration/keys/${key.id}`);
      setRevoking(null);
      account.reload();
    } catch (error) {
      api.report(error);
    }
  };

  const events = useLoad(
    useCallback(
      () =>
        api.get<ServiceList<ExternalEventView>>('/external-events', {
          status,
          page,
          pageSize: 20,
        }),
      [api, status, page],
    ),
  );

  const subsystems = overall.data
    ? [
        {
          key: 'workflow',
          ok: overall.data.workflowConfigured,
          label: t('service.integration.workflow'),
        },
        {
          key: 'notification',
          ok: overall.data.notificationConfigured,
          label: t('service.integration.notification'),
        },
        {
          key: 'knowledge',
          ok: overall.data.knowledgeIndexConfigured,
          label: t('service.integration.knowledgeIndex'),
        },
      ]
    : [];

  return (
    <ServicePage
      title={t('service.integration.title')}
      description={t('service.integration.description')}
    >
      {overall.loading ? <Loading /> : null}
      {overall.error ? (
        <LoadFailure message={overall.error} onRetry={() => overall.reload()} />
      ) : null}
      {overall.data ? (
        <div className='grid gap-4 lg:grid-cols-3'>
          <Card className='lg:col-span-2'>
            <CardHeader>
              <CardTitle className='text-base'>
                {t('service.integration.subsystems')}
              </CardTitle>
              <CardDescription>
                {t('service.integration.subsystemsHint')}
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              {subsystems.map((row) => (
                <div
                  key={row.key}
                  className='flex items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0'
                >
                  <span className='text-sm font-medium'>{row.label}</span>
                  <span className='flex items-center gap-2 text-sm'>
                    {row.ok ? (
                      <CheckCircle2Icon className='size-4 text-primary' />
                    ) : (
                      <TriangleAlertIcon className='size-4 text-amber-600 dark:text-amber-400' />
                    )}
                    {row.ok
                      ? t('service.integration.connected')
                      : t('service.integration.notConfigured')}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className='text-base'>
                {t('service.integration.eventCounts')}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              {overall.data.eventStatuses.map((row) => (
                <div
                  key={row.status}
                  className='flex items-center justify-between text-sm'
                >
                  <StatusBadge status={row.status} />
                  <span className='font-mono'>{row.count}</span>
                </div>
              ))}
              <div className='pt-2 text-xs text-muted-foreground'>
                {t('service.integration.source')}: {overall.data.externalSource}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {isManager ? (
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <KeyRoundIcon className='size-4' />
              {t('service.integration.account')}
            </CardTitle>
            <CardDescription>
              {t('service.integration.accountHint')}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            {account.loading ? <Loading /> : null}
            {account.error ? (
              <LoadFailure
                message={account.error}
                onRetry={() => account.reload()}
              />
            ) : null}
            {account.data ? (
              <>
                {account.data.account ? (
                  <div className='grid gap-3 text-sm sm:grid-cols-3'>
                    <div>
                      <div className='text-xs text-muted-foreground'>
                        {t('service.integration.accountName')}
                      </div>
                      <div className='font-medium'>
                        {account.data.account.name ?? '—'}
                      </div>
                    </div>
                    <div>
                      <div className='text-xs text-muted-foreground'>
                        {t('service.integration.accountEmail')}
                      </div>
                      <div className='font-medium'>
                        {account.data.account.email ?? '—'}
                      </div>
                    </div>
                    <div>
                      <div className='text-xs text-muted-foreground'>
                        {t('service.integration.accountRole')}
                      </div>
                      <div>
                        <Badge variant='secondary'>
                          {'service-integrator'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ) : null}

                {!account.data.keysAvailable ? (
                  <p className='text-sm text-muted-foreground'>
                    {t('service.integration.keysUnavailable')}
                  </p>
                ) : (
                  <>
                    <Button
                      size='sm'
                      disabled={!account.data.account}
                      onClick={() => setCreatingKey(true)}
                    >
                      <PlusIcon className='size-4' />
                      {t('service.integration.createKey')}
                    </Button>
                    {account.data.apiKeys.length === 0 ? (
                      <EmptyState message={t('service.integration.noKeys')} />
                    ) : (
                      <div className='overflow-x-auto'>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>
                                {t('service.integration.keyName')}
                              </TableHead>
                              <TableHead>
                                {t('service.integration.keyPrefix')}
                              </TableHead>
                              <TableHead>
                                {t('service.integration.keyCreated')}
                              </TableHead>
                              <TableHead>
                                {t('service.integration.keyExpires')}
                              </TableHead>
                              <TableHead>
                                {t('service.integration.keyLastUsed')}
                              </TableHead>
                              <TableHead className='text-right'>
                                {t('service.common.actions')}
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {account.data.apiKeys.map((key) => (
                              <TableRow key={key.id}>
                                <TableCell className='text-sm font-medium'>
                                  {key.name ?? '—'}
                                </TableCell>
                                <TableCell className='font-mono text-xs'>
                                  {key.prefix ?? key.start ?? '—'}
                                </TableCell>
                                <TableCell className='text-xs text-muted-foreground'>
                                  {formatDateTime(key.createdAt)}
                                </TableCell>
                                <TableCell className='text-xs text-muted-foreground'>
                                  {key.expiresAt
                                    ? formatDateTime(key.expiresAt)
                                    : t('service.integration.keyNever')}
                                </TableCell>
                                <TableCell className='text-xs text-muted-foreground'>
                                  {key.lastRequest
                                    ? formatDateTime(key.lastRequest)
                                    : t('service.integration.keyNever')}
                                </TableCell>
                                <TableCell className='text-right'>
                                  <Button
                                    variant='outline'
                                    size='sm'
                                    onClick={() => setRevoking(key)}
                                  >
                                    <Trash2Icon className='size-4' />
                                    {t('service.integration.revoke')}
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </>
                )}
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2 text-base'>
            <KeyRoundIcon className='size-4' />
            {t('service.integration.contract')}
          </CardTitle>
          <CardDescription>
            {t('service.integration.contractHint')}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-3 text-sm'>
          <pre className='overflow-x-auto rounded-md border border-border bg-muted/40 p-3 text-xs'>
            {`POST /api/service/external/repairs
x-api-key: <integration account API key>
Content-Type: application/json

{
  "eventId": "device-2026-0001",
  "equipmentNo": "EQ-1001",
  "title": "Spindle overheat",
  "problem": "Temperature alarm at 92°C",
  "priority": "urgent"
}`}
          </pre>
          <pre className='overflow-x-auto rounded-md border border-border bg-muted/40 p-3 text-xs'>
            {`GET /api/service/external/repairs/:id
x-api-key: <integration account API key>

# -> { status, deadline, externalEvent, timeline, … }`}
          </pre>
          <p className='text-muted-foreground'>
            {t('service.integration.readContractHint')}
          </p>
          <p className='text-muted-foreground'>
            {t('service.integration.contractPathHint')}
          </p>
          <Button
            variant='outline'
            disabled={simulating}
            onClick={() => setSimulating(true)}
          >
            <UploadIcon className='size-4' />
            {t('service.integration.simulate')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>
            {t('service.integration.externalEvents')}
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='max-w-xs space-y-1.5'>
            <Label htmlFor='event-status'>
              {t('service.integration.eventStatus')}
            </Label>
            <Select
              value={status || 'all'}
              onValueChange={(value) => {
                setPage(1);
                setStatus(value === 'all' ? '' : String(value));
              }}
            >
              <SelectTrigger id='event-status' className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>{t('service.common.all')}</SelectItem>
                {EVENT_STATUSES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {t(`service.externalStatus.${item}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {events.loading ? <Loading /> : null}
          {events.error ? (
            <LoadFailure
              message={events.error}
              onRetry={() => events.reload()}
            />
          ) : null}
          {events.data ? (
            <>
              {events.data.rows.length === 0 ? (
                <EmptyState message={t('service.integration.noEvents')} />
              ) : (
                <div className='overflow-x-auto'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          {t('service.integration.eventId')}
                        </TableHead>
                        <TableHead>
                          {t('service.integration.eventStatus')}
                        </TableHead>
                        <TableHead>
                          {t('service.integration.eventMessage')}
                        </TableHead>
                        <TableHead>
                          {t('service.integration.eventWorkOrder')}
                        </TableHead>
                        <TableHead>
                          {t('service.integration.eventTime')}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {events.data.rows.map((row) => (
                        <TableRow key={String(row.id)}>
                          <TableCell className='font-mono text-xs'>
                            {row.eventId}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={row.status} />
                          </TableCell>
                          <TableCell className='max-w-72 text-sm'>
                            {row.message ?? '—'}
                          </TableCell>
                          <TableCell>
                            {row.workOrderId ? (
                              <Link
                                className='text-sm underline'
                                to={`/service/work-orders/${row.workOrderId}`}
                              >
                                #{row.workOrderId}
                              </Link>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell className='text-xs text-muted-foreground'>
                            {formatDateTime(row.createdAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <Pagination
                page={events.data.page}
                pageSize={events.data.pageSize}
                total={events.data.total}
                onPage={setPage}
              />
            </>
          ) : null}
        </CardContent>
      </Card>

      <SimulateDialog
        open={simulating}
        onOpenChange={setSimulating}
        onSaved={() => {
          setSimulating(false);
          overall.reload();
          events.reload();
        }}
      />

      <CreateKeyDialog
        open={creatingKey}
        onOpenChange={setCreatingKey}
        onCreated={(value) => {
          setCreatingKey(false);
          setSecret(value);
          account.reload();
        }}
      />

      <Dialog
        open={secret !== null}
        onOpenChange={(open) => {
          if (!open) setSecret(null);
        }}
      >
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>{t('service.integration.secretTitle')}</DialogTitle>
            <DialogDescription>
              {t('service.integration.secretHint')}
            </DialogDescription>
          </DialogHeader>
          <pre className='overflow-x-auto rounded-md border border-border bg-muted/40 p-3 text-xs break-all whitespace-pre-wrap'>
            {secret ?? ''}
          </pre>
          <DialogFooter>
            <Button
              type='button'
              onClick={() => {
                void navigator.clipboard?.writeText(secret ?? '');
                setSecret(null);
              }}
            >
              {t('service.integration.copySecret')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('service.integration.revokeKey')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('service.integration.revokeKeyConfirm', {
                name: revoking?.name ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('service.common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={() => {
                void revokeKey();
              }}
            >
              {t('service.integration.revoke')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ServicePage>
  );
}

function SimulateDialog({
  onOpenChange,
  onSaved,
  open,
}: {
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: () => void;
  readonly open: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const [busy, setBusy] = useState(false);
  const [priority, setPriority] = useState('normal');

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await api.post('/external/repairs', {
        eventId: formText(data, 'eventId') || `device-${Date.now()}`,
        equipmentNo: formText(data, 'equipmentNo'),
        title: formText(data, 'title'),
        problem: formText(data, 'problem'),
        priority,
      });
      onSaved();
    } catch (error) {
      api.report(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('service.integration.simulate')}</DialogTitle>
            <DialogDescription>
              {t('service.integration.simulateHint')}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className='py-4'>
            <Field>
              <FieldLabel htmlFor='sim-event-id'>
                {t('service.integration.eventId')}
              </FieldLabel>
              <Input
                id='sim-event-id'
                name='eventId'
                placeholder='device-1001'
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='sim-equipment'>
                {t('service.integration.equipmentNo')}
              </FieldLabel>
              <Input
                id='sim-equipment'
                name='equipmentNo'
                required
                defaultValue='EQ-1001'
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='sim-title'>
                {t('service.workOrders.fTitle')}
              </FieldLabel>
              <Input
                id='sim-title'
                name='title'
                defaultValue='Spindle overheat'
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='sim-problem'>
                {t('service.workOrders.fProblem')}
              </FieldLabel>
              <Textarea id='sim-problem' name='problem' rows={3} />
            </Field>
            <Field>
              <FieldLabel htmlFor='sim-priority'>
                {t('service.workOrders.priority')}
              </FieldLabel>
              <Select
                value={priority}
                onValueChange={(value) => setPriority(String(value))}
              >
                <SelectTrigger id='sim-priority' className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='normal'>
                    {t('service.priority.normal')}
                  </SelectItem>
                  <SelectItem value='urgent'>
                    {t('service.priority.urgent')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
            >
              {t('service.common.cancel')}
            </Button>
            <Button type='submit' disabled={busy}>
              {t('service.common.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Issue a key for the integration account.
 *
 * The account is chosen by the server, never by this form: the caller names the
 * key and, optionally, a lifetime, and the response carries the one-time
 * secret. `onCreated` receives that secret so the caller can show it before it
 * is gone forever.
 */
function CreateKeyDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (secret: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const days = Number(formText(data, 'expiresInDays'));
    setBusy(true);
    try {
      const created = await api.post<{ secret: string }>('/integration/keys', {
        name: formText(data, 'name'),
        expiresInDays: Number.isFinite(days) && days > 0 ? days : null,
      });
      onCreated(created.secret);
    } catch (error) {
      api.report(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('service.integration.createKey')}</DialogTitle>
            <DialogDescription>
              {t('service.integration.createKeyHint')}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className='py-4'>
            <Field>
              <FieldLabel htmlFor='key-name'>
                {t('service.integration.keyName')}
              </FieldLabel>
              <Input
                id='key-name'
                name='name'
                required
                defaultValue='device-platform'
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='key-expiry'>
                {t('service.integration.keyExpiresInDays')}
              </FieldLabel>
              <Input
                id='key-expiry'
                name='expiresInDays'
                type='number'
                min={1}
                step={1}
                placeholder={t('service.integration.keyNever')}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
            >
              {t('service.common.cancel')}
            </Button>
            <Button type='submit' disabled={busy}>
              {t('service.integration.createKeyAction')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
