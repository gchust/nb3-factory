import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { PlayIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ErrorState,
  LoadingState,
  SelectField,
} from '@/pages/service/shared.js';
import {
  PRIORITIES,
  formatDateTime,
  useActionFeedback,
  useServiceList,
  useServiceMe,
  useServiceObject,
} from '@/pages/service/service-api.js';
import type {
  IntegrationApiKey,
  IntegrationStatus,
  Ticket,
} from '@/pages/service/types.js';

interface RunResult {
  [key: string]: unknown;
}

const CAPABILITY_KEYS = [
  'authorization',
  'workflow',
  'scheduler',
  'notification',
  'knowledgeBase',
  'llmService',
  'vectorDatabase',
  'embeddingModel',
] as const;

export default function OperationsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const me = useServiceMe();
  const feedback = useActionFeedback();
  const integration = useServiceObject<IntegrationStatus>(
    'service/integration-status',
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, RunResult>>({});
  const [externalEventNo, setExternalEventNo] = useState('');
  const [externalSerial, setExternalSerial] = useState('');
  const [externalTitle, setExternalTitle] = useState('');
  const [externalPriority, setExternalPriority] = useState('normal');
  const [externalResult, setExternalResult] = useState<{
    ticket: Ticket;
    duplicate: boolean;
  } | null>(null);
  const integrationKeys = useServiceList<IntegrationApiKey>(
    'service/integration/api-keys',
    undefined,
    '',
  );
  const [revokingKey, setRevokingKey] = useState<string | null>(null);

  const run = async (key: string, path: string): Promise<void> => {
    setBusy(key);
    try {
      // `api.request` resolves to the whole response body, so the payload is the
      // `data` property. Storing the envelope would render `{ data: … }` and,
      // worse, make every caller below read fields one level too high.
      const { data } = await api.request<{ data: RunResult }>({
        path,
        method: 'POST',
        json: {},
      });
      setRuns((previous) => ({ ...previous, [key]: data }));
      feedback.success(t(`service.operations.done.${key}`));
    } catch (runError) {
      feedback.failure(runError);
    } finally {
      setBusy(null);
    }
  };

  const submitExternal = async (): Promise<void> => {
    setBusy('external');
    try {
      const { data } = await api.request<{
        data: { ticket: Ticket; duplicate: boolean };
      }>({
        path: 'service/external/tickets',
        method: 'POST',
        json: {
          eventNo: externalEventNo,
          deviceSerial: externalSerial,
          title: externalTitle || undefined,
          priority: externalPriority,
        },
      });
      setExternalResult(data);
      feedback.success(
        data.duplicate
          ? t('service.operations.externalDuplicate')
          : t('service.operations.externalCreated'),
      );
    } catch (submitError) {
      feedback.failure(submitError);
    } finally {
      setBusy(null);
    }
  };

  const revokeKey = async (key: IntegrationApiKey): Promise<void> => {
    setRevokingKey(key.id);
    try {
      await api.request({
        path: `service/integration/api-keys/${key.id}/revoke`,
        method: 'POST',
        json: {},
      });
      feedback.success(t('service.operations.keyRevoked'));
      integrationKeys.reload();
    } catch (revokeError) {
      feedback.failure(revokeError);
    } finally {
      setRevokingKey(null);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('service.operations.title')}
        description={t('service.operations.description')}
      />

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>
            {t('service.operations.integration')}
          </CardTitle>
          <CardDescription>
            {t('service.operations.integrationHint')}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-3'>
          {integration.loading ? <LoadingState /> : null}
          {integration.error ? (
            <ErrorState
              error={integration.error}
              onRetry={integration.reload}
            />
          ) : null}
          {integration.data ? (
            <>
              <ul className='grid gap-2 sm:grid-cols-2'>
                {CAPABILITY_KEYS.map((key) => (
                  <li key={key} className='flex items-center gap-2 text-sm'>
                    <Badge
                      variant={integration.data?.[key] ? 'default' : 'outline'}
                    >
                      {integration.data?.[key]
                        ? t('service.common.available')
                        : t('service.common.unavailable')}
                    </Badge>
                    {t(`service.operations.capability.${key}`)}
                  </li>
                ))}
              </ul>
              {integration.data.missing.length > 0 ? (
                <div className='rounded-md border border-dashed p-3 text-xs text-muted-foreground'>
                  <p className='font-medium'>
                    {t('service.assistant.missingTitle')}
                  </p>
                  <ul className='mt-1 list-disc pl-5'>
                    {integration.data.missing.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
        </CardContent>
      </Card>

      {me?.supervisor ? (
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>
              {t('service.operations.scheduled')}
            </CardTitle>
            <CardDescription>
              {t('service.operations.scheduledHint')}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='flex flex-wrap gap-3'>
              <Button
                variant='outline'
                disabled={busy !== null}
                onClick={() =>
                  void run(
                    'generateInspections',
                    'service/operations/generate-inspections',
                  )
                }
              >
                <PlayIcon data-icon='inline-start' />
                {t('service.operations.generateInspections')}
              </Button>
              <Button
                variant='outline'
                disabled={busy !== null}
                onClick={() =>
                  void run(
                    'sendOverdueReminders',
                    'service/operations/send-overdue-reminders',
                  )
                }
              >
                <PlayIcon data-icon='inline-start' />
                {t('service.operations.sendOverdueReminders')}
              </Button>
            </div>
            {Object.entries(runs).map(([key, result]) => {
              const scheduleId =
                typeof result.scheduleId === 'string'
                  ? result.scheduleId
                  : null;
              const status =
                typeof result.status === 'string' ? result.status : null;
              return (
                <div
                  key={key}
                  className='rounded-md bg-muted p-3 text-xs text-muted-foreground'
                >
                  <div className='flex flex-wrap items-center gap-2'>
                    <p className='font-medium'>
                      {t(`service.operations.label.${key}`)}
                    </p>
                    {status ? (
                      <Badge
                        variant={
                          status === 'unscheduled' ? 'outline' : 'secondary'
                        }
                      >
                        {t(
                          status === 'unscheduled'
                            ? 'service.operations.runUnscheduled'
                            : 'service.operations.runScheduled',
                        )}
                      </Badge>
                    ) : null}
                  </div>
                  {scheduleId ? (
                    <p className='mt-1'>
                      <Link
                        className='underline underline-offset-2'
                        to={`/settings/schedules/${encodeURIComponent(
                          scheduleId,
                        )}`}
                      >
                        {t('service.operations.openExecutionRecords')}
                      </Link>
                    </p>
                  ) : null}
                  <pre className='mt-1 whitespace-pre-wrap break-all'>
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {me?.supervisor ? (
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>
              {t('service.operations.integrationKeys')}
            </CardTitle>
            <CardDescription>
              {t('service.operations.integrationKeysHint')}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            {integrationKeys.loading ? <LoadingState /> : null}
            {integrationKeys.error ? (
              <ErrorState
                error={integrationKeys.error}
                onRetry={integrationKeys.reload}
              />
            ) : null}
            {integrationKeys.data && integrationKeys.data.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                {t('service.operations.integrationKeysEmpty')}
              </p>
            ) : null}
            {(integrationKeys.data ?? []).map((key) => (
              <div
                key={key.id}
                className='flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm'
              >
                <div className='space-y-1'>
                  <p className='font-medium'>
                    {key.name ?? key.id}{' '}
                    <Badge variant={key.enabled ? 'default' : 'outline'}>
                      {key.enabled
                        ? t('service.status.ready')
                        : t('service.status.unconfigured')}
                    </Badge>
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    {t('service.operations.keyOwner')}: {key.ownerName}
                    {' · '}
                    {t('service.operations.keyPrefix')}: {key.start ?? '—'}
                    {' · '}
                    {t('service.operations.keyCreated')}:{' '}
                    {formatDateTime(key.createdAt)}
                  </p>
                </div>
                <Button
                  variant='destructive'
                  disabled={revokingKey !== null}
                  onClick={() => void revokeKey(key)}
                >
                  {t('service.operations.keyRevoke')}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {me?.supervisor ? (
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>
              {t('service.operations.externalTitle')}
            </CardTitle>
            <CardDescription>
              {t('service.operations.externalHint')}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid gap-3 sm:grid-cols-2'>
              <div className='grid gap-2'>
                <Label htmlFor='external-event'>
                  {t('service.operations.eventNo')}
                </Label>
                <Input
                  id='external-event'
                  value={externalEventNo}
                  onChange={(event) => setExternalEventNo(event.target.value)}
                />
              </div>
              <div className='grid gap-2'>
                <Label htmlFor='external-serial'>
                  {t('service.devices.serial')}
                </Label>
                <Input
                  id='external-serial'
                  value={externalSerial}
                  onChange={(event) => setExternalSerial(event.target.value)}
                />
              </div>
              <div className='grid gap-2'>
                <Label htmlFor='external-title'>
                  {t('service.tickets.fieldTitle')}
                </Label>
                <Input
                  id='external-title'
                  value={externalTitle}
                  onChange={(event) => setExternalTitle(event.target.value)}
                />
              </div>
              <div className='grid gap-2'>
                <Label htmlFor='external-priority'>
                  {t('service.tickets.priority')}
                </Label>
                <SelectField
                  id='external-priority'
                  value={externalPriority}
                  onValueChange={setExternalPriority}
                  options={PRIORITIES.map((value) => ({
                    value,
                    label: t(`service.priority.${value}`),
                  }))}
                />
              </div>
            </div>
            <Button
              disabled={
                busy !== null ||
                externalEventNo.trim() === '' ||
                externalSerial.trim() === ''
              }
              onClick={() => void submitExternal()}
            >
              {t('service.operations.submitExternal')}
            </Button>
            {externalResult ? (
              <div className='rounded-md border p-3 text-sm'>
                <Badge
                  variant={externalResult.duplicate ? 'outline' : 'default'}
                >
                  {externalResult.duplicate
                    ? t('service.operations.duplicate')
                    : t('service.operations.created')}
                </Badge>
                <p className='mt-2 font-mono text-xs'>
                  {externalResult.ticket.ticketNo} ·{' '}
                  {externalResult.ticket.title}
                </p>
                <p className='text-xs text-muted-foreground'>
                  {t('service.tickets.eventNo')}:{' '}
                  {externalResult.ticket.externalEventNo ?? '—'}
                </p>
              </div>
            ) : null}
            <div className='rounded-md border border-dashed p-3 text-xs text-muted-foreground'>
              <p className='font-medium'>
                {t('service.operations.apiContract')}
              </p>
              <ul className='mt-1 space-y-1 font-mono'>
                <li>POST {'{base}'}/api/service/external/tickets</li>
                <li>GET {'{base}'}/api/service/external/tickets?eventNo=…</li>
                <li>
                  GET {'{base}'}/api/service/external/tickets/{'{ticketNo}'}
                </li>
              </ul>
              <p className='mt-2'>{t('service.operations.apiKeyHint')}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </PageContainer>
  );
}
