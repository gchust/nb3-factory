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
  fileContentUrl,
  getSessionContext,
  getTask,
  removeInspectionAttachment,
  saveTaskResults,
  submitTask,
  uploadInspectionFiles,
  useAsync,
} from '@/components/inspection/api.js';
import { formatDateTime } from '@/components/inspection/format.js';
import { FilePanel } from '@/components/inspection/file-panel.js';
import { TaskStatusBadge } from '@/components/inspection/status-badge.js';
import type { InspectionTaskDetail } from '@/components/inspection/types.js';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface Draft {
  result: string | null;
  remark: string;
}

export default function InspectionDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const navigate = useNavigate();
  const { id } = useParams();
  const taskId = Number(id);
  const task = useAsync(`inspection-${id}`, (client) =>
    getTask(client, taskId),
  );
  const session = useAsync('session', getSessionContext);
  // The draft starts from the loaded task and keeps the inspector's edits.
  // It is keyed by task id, so switching tasks adopts the new server values.
  const [draftState, setDraftState] = useState<{
    taskId: number;
    values: Record<number, Draft>;
  }>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const data = task.data;
  const draft =
    draftState && data && draftState.taskId === data.id
      ? draftState.values
      : draftFrom(data);

  const isAssignee = Boolean(
    data && session.data && data.assigneeId === session.data.userId,
  );
  const canEdit = Boolean(data && isAssignee && data.status !== 'submitted');

  function updateDraft(resultId: number, patch: Partial<Draft>): void {
    if (!data) return;
    const current = draft[resultId] ?? { result: null, remark: '' };
    setDraftState({
      taskId: data.id,
      values: { ...draft, [resultId]: { ...current, ...patch } },
    });
  }

  function setResult(resultId: number, result: string): void {
    updateDraft(resultId, { result });
  }

  function setRemark(resultId: number, remark: string): void {
    updateDraft(resultId, { remark });
  }

  function entries() {
    return (data?.results ?? []).map((item) => ({
      resultId: item.id,
      result: draft[item.id]?.result ?? null,
      remark: draft[item.id]?.remark ?? '',
    }));
  }

  async function save(): Promise<void> {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await saveTaskResults(api, taskId, entries());
      setMessage(t('inspections.saved'));
      task.reload();
    } catch (cause) {
      setError(messageOf(cause, t('inspections.saveFailed')));
    } finally {
      setBusy(false);
    }
  }

  async function submit(): Promise<void> {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await saveTaskResults(api, taskId, entries());
      const result = await submitTask(api, taskId);
      setMessage(t('inspections.submitted', { count: result.repairOrders }));
      task.reload();
    } catch (cause) {
      setError(messageOf(cause, t('inspections.submitFailed')));
    } finally {
      setBusy(false);
    }
  }

  if (task.loading) {
    return (
      <PageContainer className='mx-auto max-w-4xl'>
        <Loading label={t('status.loading')} />
      </PageContainer>
    );
  }

  if (task.error || !data) {
    return (
      <PageContainer className='mx-auto max-w-4xl'>
        <p role='alert' className='text-sm text-destructive'>
          {t('inspections.detailFailed')}
        </p>
        <Button variant='outline' onClick={() => void navigate('/inspections')}>
          <ArrowLeft className='size-4' />
          {t('inspections.back')}
        </Button>
      </PageContainer>
    );
  }

  return (
    <PageContainer className='mx-auto max-w-4xl'>
      <Breadcrumbs />
      <PageHeader
        title={t('inspections.detailTitle', { code: data.code })}
        description={`${data.equipmentCode ?? ''} ${data.equipmentName ?? ''} · ${data.templateName ?? ''}`}
        actions={
          <Link
            to='/inspections'
            className='text-sm font-medium text-primary hover:underline'
          >
            {t('inspections.back')}
          </Link>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>
            {t('inspections.summary')}
          </CardTitle>
        </CardHeader>
        <CardContent className='grid gap-3 text-sm sm:grid-cols-2'>
          <Info
            label={t('inspections.assignee')}
            value={data.assigneeName ?? data.assigneeId}
          />
          <Info
            label={t('inspections.plannedDate')}
            value={formatDateTime(data.plannedDate)}
          />
          <Info
            label={t('inspections.status')}
            value={<TaskStatusBadge status={data.status} />}
          />
          <Info
            label={t('inspections.progress')}
            value={`${data.answeredCount}/${data.resultCount}`}
          />
          {data.equipment?.photoFileId ? (
            <div className='sm:col-span-2'>
              <Label>{t('equipment.photo')}</Label>
              <img
                src={fileContentUrl(data.equipment.photoFileId)}
                alt={data.equipment.name}
                className='mt-1 h-32 w-48 rounded object-cover'
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {!canEdit ? (
        <p className='text-sm text-muted-foreground'>
          {data.status === 'submitted'
            ? t('inspections.readOnlySubmitted')
            : t('inspections.readOnlyNotAssignee')}
        </p>
      ) : null}

      <div className='space-y-4'>
        {data.results.map((item) => (
          <Card key={item.id}>
            <CardHeader>
              <CardTitle className='flex items-center justify-between gap-3 text-base'>
                <span>{item.title}</span>
                {draft[item.id]?.result === 'abnormal' ? (
                  <Badge variant='destructive'>
                    {t('inspections.abnormal')}
                  </Badge>
                ) : draft[item.id]?.result === 'normal' ? (
                  <Badge variant='secondary'>{t('inspections.normal')}</Badge>
                ) : null}
              </CardTitle>
              <p className='text-sm text-muted-foreground'>
                {t('inspections.standard')}: {item.standard}
              </p>
            </CardHeader>
            <CardContent className='space-y-3'>
              {canEdit ? (
                <div className='flex gap-2'>
                  <Button
                    type='button'
                    variant={
                      draft[item.id]?.result === 'normal'
                        ? 'default'
                        : 'outline'
                    }
                    onClick={() => setResult(item.id, 'normal')}
                  >
                    {t('inspections.normal')}
                  </Button>
                  <Button
                    type='button'
                    variant={
                      draft[item.id]?.result === 'abnormal'
                        ? 'destructive'
                        : 'outline'
                    }
                    onClick={() => setResult(item.id, 'abnormal')}
                  >
                    {t('inspections.abnormal')}
                  </Button>
                </div>
              ) : null}
              {canEdit ? (
                <div className='space-y-1'>
                  <Label htmlFor={`remark-${item.id}`}>
                    {t('inspections.remark')}
                  </Label>
                  <Textarea
                    id={`remark-${item.id}`}
                    value={draft[item.id]?.remark ?? ''}
                    onChange={(event) => setRemark(item.id, event.target.value)}
                    placeholder={t('inspections.remarkPlaceholder')}
                  />
                </div>
              ) : item.remark ? (
                <p className='text-sm'>
                  <span className='text-muted-foreground'>
                    {t('inspections.remark')}:{' '}
                  </span>
                  {item.remark}
                </p>
              ) : null}
              <div className='space-y-1'>
                <Label>{t('inspections.files')}</Label>
                <FilePanel
                  files={item.attachments}
                  editable={canEdit}
                  disabledReason={
                    canEdit ? undefined : t('inspections.filesReadOnly')
                  }
                  onUpload={
                    canEdit
                      ? async (files, note) => {
                          await uploadInspectionFiles(
                            api,
                            taskId,
                            item.id,
                            files,
                            note || undefined,
                          );
                          task.reload();
                        }
                      : undefined
                  }
                  onRemove={
                    canEdit
                      ? async (attachment) => {
                          await removeInspectionAttachment(api, attachment.id);
                          task.reload();
                        }
                      : undefined
                  }
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

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

      {canEdit ? (
        <div className='flex gap-2'>
          <Button variant='outline' disabled={busy} onClick={() => void save()}>
            {t('inspections.saveDraft')}
          </Button>
          <Button disabled={busy} onClick={() => void submit()}>
            {t('inspections.submit')}
          </Button>
        </div>
      ) : null}
    </PageContainer>
  );
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

function draftFrom(
  data: InspectionTaskDetail | undefined,
): Record<number, Draft> {
  const draft: Record<number, Draft> = {};
  for (const item of data?.results ?? []) {
    draft[item.id] = { result: item.result, remark: item.remark ?? '' };
  }
  return draft;
}
