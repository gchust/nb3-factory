import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeft } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Loading } from '@/components/loading';
import {
  addRepairRecord,
  assignRepair,
  getRepair,
  getSessionContext,
  listPeople,
  removeRepairAttachment,
  reviewRepair,
  setRepairPriority,
  startRepair,
  submitRepairReview,
  uploadRepairFiles,
  useAsync,
} from '@/components/inspection/api.js';
import { formatDateTime, PRIORITIES } from '@/components/inspection/format.js';
import { FilePanel } from '@/components/inspection/file-panel.js';
import {
  PriorityBadge,
  RepairStatusBadge,
} from '@/components/inspection/status-badge.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export default function RepairDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const navigate = useNavigate();
  const { id } = useParams();
  const orderId = Number(id);
  const repair = useAsync(`repair-${id}`, (client) =>
    getRepair(client, orderId),
  );
  const session = useAsync('session', getSessionContext);
  // Inputs are keyed by order id so opening another order starts blank.
  const [recordState, setRecordState] = useState({ id: orderId, value: '' });
  const [remarkState, setRemarkState] = useState({ id: orderId, value: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const data = repair.data;
  const record = recordState.id === orderId ? recordState.value : '';
  const reviewRemark = remarkState.id === orderId ? remarkState.value : '';
  const setRecord = (value: string) => setRecordState({ id: orderId, value });
  const setReviewRemark = (value: string) =>
    setRemarkState({ id: orderId, value });

  const roles = session.data?.roles ?? [];
  const isManager = roles.some(
    (role) => role === 'system-administrator' || role === 'equipment-manager',
  );
  const isAssignee = Boolean(
    data && session.data && data.assigneeId === session.data.userId,
  );
  const status = data?.status ?? '';
  const canHandle =
    isAssignee && ['pending', 'processing', 'returned'].includes(status);
  const canEditFiles =
    (isManager || isAssignee) && !['review', 'closed'].includes(status);

  async function run(
    action: () => Promise<unknown>,
    success?: string,
  ): Promise<void> {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
      if (success) setMessage(success);
      repair.reload();
    } catch (cause) {
      setError(messageOf(cause, t('repairs.actionFailed')));
    } finally {
      setBusy(false);
    }
  }

  if (repair.loading) {
    return (
      <PageContainer className='mx-auto max-w-4xl'>
        <Loading label={t('status.loading')} />
      </PageContainer>
    );
  }

  if (repair.error || !data) {
    return (
      <PageContainer className='mx-auto max-w-4xl'>
        <p role='alert' className='text-sm text-destructive'>
          {t('repairs.detailFailed')}
        </p>
        <Button variant='outline' onClick={() => void navigate('/repairs')}>
          <ArrowLeft className='size-4' />
          {t('repairs.back')}
        </Button>
      </PageContainer>
    );
  }

  return (
    <PageContainer className='mx-auto max-w-4xl'>
      <Breadcrumbs />
      <PageHeader
        title={t('repairs.detailTitle', { code: data.code })}
        description={`${data.equipmentCode ?? ''} ${data.equipmentName ?? ''}`}
        actions={
          <Link
            to='/repairs'
            className='text-sm font-medium text-primary hover:underline'
          >
            {t('repairs.back')}
          </Link>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>{t('repairs.summary')}</CardTitle>
        </CardHeader>
        <CardContent className='grid gap-3 text-sm sm:grid-cols-2'>
          <Info
            label={t('repairs.status')}
            value={<RepairStatusBadge status={data.status} />}
          />
          <Info
            label={t('repairs.priority')}
            value={<PriorityBadge priority={data.priority} />}
          />
          <Info
            label={t('repairs.assignee')}
            value={data.assigneeName ?? t('repairs.unassigned')}
          />
          <Info
            label={t('repairs.createdAt')}
            value={formatDateTime(data.createdAt)}
          />
          <div className='sm:col-span-2'>
            <p className='text-muted-foreground'>{t('repairs.source')}</p>
            <p className='font-medium'>{data.sourceTitle ?? '-'}</p>
            {data.sourceRemark ? (
              <p className='text-muted-foreground'>{data.sourceRemark}</p>
            ) : null}
          </div>
          {data.reviewRemark ? (
            <div className='sm:col-span-2'>
              <p className='text-muted-foreground'>
                {t('repairs.reviewRemark')}
              </p>
              <p>{data.reviewRemark}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {isManager ? (
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>
              {t('repairs.managerActions')}
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div className='flex flex-wrap items-end gap-3'>
              <ManagerAssignee order={data} onChanged={repair.reload} />
              <ManagerPriority order={data} onChanged={repair.reload} />
            </div>
            {status === 'review' ? (
              <div className='space-y-2'>
                <Label htmlFor='review-remark'>
                  {t('repairs.reviewRemark')}
                </Label>
                <Textarea
                  id='review-remark'
                  value={reviewRemark}
                  onChange={(event) => setReviewRemark(event.target.value)}
                  placeholder={t('repairs.reviewRemarkPlaceholder')}
                />
                <div className='flex gap-2'>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => reviewRepair(api, orderId, 'close', reviewRemark),
                        t('repairs.closed'),
                      )
                    }
                  >
                    {t('repairs.close')}
                  </Button>
                  <Button
                    variant='outline'
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          reviewRepair(api, orderId, 'return', reviewRemark),
                        t('repairs.returned'),
                      )
                    }
                  >
                    {t('repairs.return')}
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {canHandle ? (
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>
              {t('repairs.handleActions')}
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div className='space-y-2'>
              <Label htmlFor='record'>{t('repairs.record')}</Label>
              <Textarea
                id='record'
                value={record}
                onChange={(event) => setRecord(event.target.value)}
                placeholder={t('repairs.recordPlaceholder')}
              />
              <Button
                variant='outline'
                disabled={busy || !record.trim()}
                onClick={() =>
                  void run(async () => {
                    await addRepairRecord(api, orderId, record.trim());
                    setRecord('');
                  }, t('repairs.recordSaved'))
                }
              >
                {t('repairs.addRecord')}
              </Button>
            </div>
            <div className='flex gap-2'>
              {status === 'pending' || status === 'returned' ? (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => startRepair(api, orderId),
                      t('repairs.started'),
                    )
                  }
                >
                  {t('repairs.start')}
                </Button>
              ) : null}
              {status === 'processing' ? (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => submitRepairReview(api, orderId),
                      t('repairs.submitted'),
                    )
                  }
                >
                  {t('repairs.submitReview')}
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>{t('repairs.records')}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.records.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('repairs.noRecords')}
            </p>
          ) : (
            <ol className='divide-y rounded-lg border text-sm'>
              {data.records.map((item) => (
                <li key={item.id} className='px-3 py-2'>
                  <p>{item.content}</p>
                  <p className='text-xs text-muted-foreground'>
                    {item.authorName ?? item.authorId} ·{' '}
                    {formatDateTime(item.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>
            {t('repairs.beforeFiles')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FilePanel
            files={data.beforeFiles}
            editable={canEditFiles}
            disabledReason={
              canEditFiles ? undefined : t('repairs.filesReadOnly')
            }
            onUpload={
              canEditFiles
                ? async (files, note) => {
                    await uploadRepairFiles(
                      api,
                      orderId,
                      'before',
                      files,
                      note || undefined,
                    );
                    repair.reload();
                  }
                : undefined
            }
            onRemove={
              canEditFiles
                ? async (attachment) => {
                    await removeRepairAttachment(api, attachment.id);
                    repair.reload();
                  }
                : undefined
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>{t('repairs.afterFiles')}</CardTitle>
        </CardHeader>
        <CardContent>
          <FilePanel
            files={data.afterFiles}
            editable={canEditFiles}
            disabledReason={
              canEditFiles ? undefined : t('repairs.filesReadOnly')
            }
            onUpload={
              canEditFiles
                ? async (files, note) => {
                    await uploadRepairFiles(
                      api,
                      orderId,
                      'after',
                      files,
                      note || undefined,
                    );
                    repair.reload();
                  }
                : undefined
            }
            onRemove={
              canEditFiles
                ? async (attachment) => {
                    await removeRepairAttachment(api, attachment.id);
                    repair.reload();
                  }
                : undefined
            }
          />
        </CardContent>
      </Card>

      {message ? (
        <p role='status' className='text-sm text-primary'>
          {message}
        </p>
      ) : null}
      {error ? (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      ) : null}
    </PageContainer>
  );
}

function ManagerAssignee(props: {
  readonly order: { id: number; assigneeId: string | null };
  readonly onChanged: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const people = useAsync('people', listPeople);
  const [busy, setBusy] = useState(false);
  // Base UI's Select.Value resolves the trigger label from `items`; without it
  // the trigger renders the raw user id.
  const items = [
    { value: '__none__', label: t('repairs.unassigned') },
    ...(people.data?.repairers ?? []).map((person) => ({
      value: person.id,
      label: person.name,
    })),
  ];
  return (
    <div className='space-y-1'>
      <Label>{t('repairs.assignee')}</Label>
      <Select
        items={items}
        value={props.order.assigneeId ?? '__none__'}
        disabled={busy}
        onValueChange={(value) => {
          setBusy(true);
          void assignRepair(
            api,
            props.order.id,
            value === '__none__' ? null : value,
          )
            .then(props.onChanged)
            .finally(() => setBusy(false));
        }}
      >
        <SelectTrigger className='w-44'>
          <SelectValue placeholder={t('repairs.unassigned')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='__none__'>{t('repairs.unassigned')}</SelectItem>
          {(people.data?.repairers ?? []).map((person) => (
            <SelectItem key={person.id} value={person.id}>
              {person.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ManagerPriority(props: {
  readonly order: { id: number; priority: string };
  readonly onChanged: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [busy, setBusy] = useState(false);
  // Base UI's Select.Value resolves the trigger label from `items`.
  const items = PRIORITIES.map((priority) => ({
    value: priority,
    label: priorityLabel(t, priority),
  }));
  return (
    <div className='space-y-1'>
      <Label>{t('repairs.priority')}</Label>
      <Select
        items={items}
        value={props.order.priority}
        disabled={busy}
        onValueChange={(value) => {
          setBusy(true);
          void setRepairPriority(
            api,
            props.order.id,
            value ?? props.order.priority,
          )
            .then(props.onChanged)
            .finally(() => setBusy(false));
        }}
      >
        <SelectTrigger className='w-36'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRIORITIES.map((priority) => (
            <SelectItem key={priority} value={priority}>
              {priorityLabel(t, priority)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function priorityLabel(
  t: (key: string, options?: Record<string, unknown>) => string,
  priority: string,
): string {
  if (priority === 'low') return t('inspection.priority.low');
  if (priority === 'normal') return t('inspection.priority.normal');
  if (priority === 'high') return t('inspection.priority.high');
  if (priority === 'urgent') return t('inspection.priority.urgent');
  return priority;
}

function Info(props: {
  readonly label: string;
  readonly value: ReactElement | string;
}): ReactElement {
  return (
    <div>
      <p className='text-muted-foreground'>{props.label}</p>
      <p className='font-medium'>{props.value}</p>
    </div>
  );
}

function messageOf(cause: unknown, fallback: string): string {
  const payload = cause as {
    payload?: { message?: unknown };
    message?: unknown;
  };
  if (typeof payload?.payload?.message === 'string') {
    return payload.payload.message;
  }
  if (cause instanceof Error && cause.message) return cause.message;
  return fallback;
}
