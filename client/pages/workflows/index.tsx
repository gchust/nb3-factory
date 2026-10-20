import { useTranslation } from '@nocobase/i18n/client';
import type { LifecycleDescription } from '@nocobase/lifecycle';
import { type ReactElement, useState } from 'react';
import { SearchIcon, WorkflowIcon } from 'lucide-react';
import { useSearchParams } from 'react-router';

import { LifecycleDiagram } from '#components/lifecycle-diagram';
import {
  WorkflowDefinitionDetail,
  WorkflowManagementLayout,
} from '#extensions/nocobase-workflow-management/index';
import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Skeleton } from '#components/ui/skeleton';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';

import {
  TICKET_STATES,
  errorText,
  useTicketLabels,
  useTicketsApi,
  type EffectRun,
  type TransitionEntry,
} from '../tickets/shared.js';

interface Definition {
  name: string;
  title: string;
  collection: string;
  stateField: string;
  initial: string;
  states: readonly string[];
  description: LifecycleDescription;
  transitions: readonly {
    name: string;
    title: string;
    from: readonly string[];
    to: readonly string[];
    manual: boolean;
    meta: Readonly<Record<string, unknown>>;
  }[];
  triggers: readonly {
    name: string;
    transition: string;
    when: readonly string[];
  }[];
  parameters: Readonly<Record<string, unknown>>;
  diagram: string;
  executionCount: number;
}

interface Execution {
  recordId: string;
  ticketNo: string;
  title: string;
  state: string;
  version: number | null;
  statusChangedAt: string;
  assigneeId: string | null;
  requesterId: string;
  transitionCount: number;
}

interface ExecutionDetail extends Execution {
  history: {
    transitions: readonly TransitionEntry[];
    effectRuns: readonly EffectRun[];
  };
  available: readonly { name: string; allowed: boolean }[];
  description: {
    description: LifecycleDescription;
    parameters: Readonly<Record<string, unknown>>;
    diagram: string;
  };
}

const TAB_LABELS = {
  definitions: 'helpdesk.workflow.tabs.definitions',
  executions: 'helpdesk.workflow.tabs.executions',
} as const;

export default function WorkflowsPage(): ReactElement {
  const { t } = useTranslation();
  const labels = useTicketLabels();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'executions' ? 'executions' : 'definitions';
  const definitionName = params.get('definition') ?? '';
  const [query, setQuery] = useState('');
  const [executionState, setExecutionState] = useState('all');
  const definitions = useTicketsApi<{ data: Definition[] }>(
    'workflows/definitions',
  );
  const executionSearch = new URLSearchParams({
    ...(query ? { q: query } : {}),
    ...(executionState !== 'all' ? { state: executionState } : {}),
  });
  const executions = useTicketsApi<{ data: Execution[] }>(
    tab === 'executions' ? `workflows/executions?${executionSearch}` : null,
  );
  const executionId = params.get('execution');
  const executionDetail = useTicketsApi<{ data: ExecutionDetail }>(
    executionId
      ? `workflows/executions/${encodeURIComponent(executionId)}`
      : null,
  );
  const selected =
    definitions.data?.data.find((item) => item.name === definitionName) ??
    definitions.data?.data[0];

  const setTab = (next: 'definitions' | 'executions') => {
    setParams(
      (old) => {
        const value = new URLSearchParams(old);
        if (next === 'executions') value.set('tab', 'executions');
        else value.delete('tab');
        value.delete('execution');
        return value;
      },
      { replace: true },
    );
  };

  const setExecution = (recordId?: string) => {
    setParams(
      (old) => {
        const value = new URLSearchParams(old);
        if (recordId) value.set('execution', recordId);
        else value.delete('execution');
        return value;
      },
      { replace: true },
    );
  };

  return (
    <>
      <WorkflowManagementLayout
        title={t('helpdesk.workflow.title')}
        description={t('helpdesk.workflow.description')}
        labels={{
          definitions: t(TAB_LABELS.definitions),
          executions: t(TAB_LABELS.executions),
        }}
        tab={tab}
        onTabChange={setTab}
      >
        {tab === 'definitions' ? (
          <div className='space-y-4'>
            {definitions.error ? (
              <Alert variant='destructive'>
                <AlertDescription>
                  {t('helpdesk.workflow.loadFailed')}
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={definitions.reload}
                  >
                    {t('helpdesk.retry')}
                  </Button>
                </AlertDescription>
              </Alert>
            ) : definitions.loading && !definitions.data ? (
              <Skeleton className='h-72 w-full' />
            ) : selected ? (
              <>
                <div className='flex flex-wrap gap-2'>
                  {(definitions.data?.data ?? []).map((definition) => (
                    <Button
                      key={definition.name}
                      variant={
                        definition.name === selected.name
                          ? 'default'
                          : 'outline'
                      }
                      size='sm'
                      onClick={() =>
                        setParams(
                          (old) => {
                            const value = new URLSearchParams(old);
                            value.set('definition', definition.name);
                            return value;
                          },
                          { replace: true },
                        )
                      }
                    >
                      <WorkflowIcon />
                      {definition.name === 'tickets'
                        ? t('helpdesk.workflow.definitionTitle')
                        : definition.title}
                    </Button>
                  ))}
                </div>
                <WorkflowDefinitionDetail
                  diagramTitle={t('helpdesk.workflow.diagram')}
                  parametersTitle={t('helpdesk.workflow.parameters')}
                  diagram={
                    <LifecycleDiagram
                      description={selected.description}
                      currentState={selected.initial}
                      stateLabel={(item) => labels.state(item.name)}
                      transitionLabel={(item) => labels.transition(item.name)}
                      ariaLabel={t('helpdesk.workflow.diagram')}
                      autoHeight
                      showMiniMap={false}
                    />
                  }
                  parameters={<Parameters definition={selected} />}
                />
              </>
            ) : (
              <Empty className='min-h-56 border border-dashed'>
                <EmptyMedia variant='icon'>
                  <WorkflowIcon />
                </EmptyMedia>
                <EmptyTitle>{t('helpdesk.workflow.empty')}</EmptyTitle>
                <EmptyDescription>
                  {t('helpdesk.workflow.emptyHint')}
                </EmptyDescription>
              </Empty>
            )}
          </div>
        ) : (
          <div className='space-y-4'>
            <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
              <div className='relative sm:max-w-xs sm:flex-1'>
                <SearchIcon className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground' />
                <Input
                  className='pl-9'
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('helpdesk.workflow.search')}
                  aria-label={t('helpdesk.workflow.search')}
                />
              </div>
              <Select
                value={executionState}
                onValueChange={(value) => setExecutionState(value ?? 'all')}
              >
                <SelectTrigger aria-label={t('helpdesk.fields.status')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>
                    {t('helpdesk.workflow.allStates')}
                  </SelectItem>
                  {TICKET_STATES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {labels.status(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {executions.error ? (
              <Alert variant='destructive'>
                <AlertDescription>
                  {t('helpdesk.workflow.loadFailed')}
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={executions.reload}
                  >
                    {t('helpdesk.retry')}
                  </Button>
                </AlertDescription>
              </Alert>
            ) : executions.loading && !executions.data ? (
              <Skeleton className='h-52 w-full' />
            ) : (executions.data?.data.length ?? 0) === 0 ? (
              <Empty className='min-h-48 border border-dashed'>
                <EmptyTitle>{t('helpdesk.workflow.noExecutions')}</EmptyTitle>
                <EmptyDescription>
                  {t('helpdesk.workflow.noExecutionsHint')}
                </EmptyDescription>
              </Empty>
            ) : (
              <div className='divide-y overflow-hidden rounded-xl border bg-card'>
                {(executions.data?.data ?? []).map((execution) => (
                  <button
                    key={execution.recordId}
                    type='button'
                    className='flex w-full flex-col gap-2 p-4 text-left transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between'
                    onClick={() => setExecution(execution.recordId)}
                  >
                    <div className='min-w-0 space-y-1'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <span className='font-mono text-xs text-muted-foreground'>
                          {execution.ticketNo}
                        </span>
                        <Badge variant='outline'>
                          {labels.state(execution.state)}
                        </Badge>
                      </div>
                      <p className='truncate font-medium'>{execution.title}</p>
                      <p className='text-xs text-muted-foreground'>
                        {t('helpdesk.workflow.transitionCount', {
                          count: execution.transitionCount,
                        })}{' '}
                        · {labels.formatDate(execution.statusChangedAt)}
                      </p>
                    </div>
                    <span className='font-mono text-xs text-muted-foreground'>
                      v{execution.version ?? 0}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </WorkflowManagementLayout>

      <Dialog
        open={Boolean(executionId)}
        onOpenChange={(open) => {
          if (!open) setExecution();
        }}
      >
        <DialogContent className='max-h-[calc(100dvh-2rem)] sm:max-w-5xl'>
          <DialogHeader>
            <DialogTitle>
              {executionDetail.data?.data.title ??
                t('helpdesk.workflow.execution')}
            </DialogTitle>
            <DialogDescription>
              {executionDetail.data?.data.ticketNo}
            </DialogDescription>
          </DialogHeader>
          {executionDetail.error ? (
            <Alert variant='destructive'>
              <AlertDescription>
                {errorText(executionDetail.error, '')}
              </AlertDescription>
            </Alert>
          ) : !executionDetail.data ? (
            <Skeleton className='h-72 w-full' />
          ) : (
            <ExecutionDetails detail={executionDetail.data.data} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Parameters({
  definition,
}: {
  readonly definition: Definition;
}): ReactElement {
  const { t } = useTranslation();
  const entries = Object.entries(definition.parameters);
  return (
    <div className='space-y-4 text-sm'>
      <div className='rounded-lg border p-3'>
        <p className='font-medium'>{t('helpdesk.workflow.definition')}</p>
        <dl className='mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs'>
          <dt className='text-muted-foreground'>
            {t('helpdesk.workflow.name')}
          </dt>
          <dd className='font-mono'>{definition.name}</dd>
          <dt className='text-muted-foreground'>
            {t('helpdesk.workflow.collection')}
          </dt>
          <dd className='font-mono'>{definition.collection}</dd>
          <dt className='text-muted-foreground'>
            {t('helpdesk.workflow.stateField')}
          </dt>
          <dd className='font-mono'>{definition.stateField}</dd>
          <dt className='text-muted-foreground'>
            {t('helpdesk.workflow.executions')}
          </dt>
          <dd>{definition.executionCount}</dd>
        </dl>
      </div>
      <div>
        <p className='font-medium'>{t('helpdesk.workflow.parameters')}</p>
        {entries.length === 0 ? (
          <p className='mt-1 text-muted-foreground'>
            {t('helpdesk.workflow.noParameters')}
          </p>
        ) : (
          <dl className='mt-2 space-y-2'>
            {entries.map(([key, value]) => (
              <div
                key={key}
                className='flex items-center justify-between gap-3 rounded-lg border p-2.5'
              >
                <dt className='font-mono text-xs'>{key}</dt>
                <dd className='text-xs'>{parameterText(value)}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className='mt-2 text-xs text-muted-foreground'>
          {t('helpdesk.workflow.parametersHint')}
        </p>
      </div>
      <div>
        <p className='font-medium'>{t('helpdesk.workflow.transitions')}</p>
        <ul className='mt-2 space-y-1.5'>
          {definition.transitions
            .filter((item) => item.manual)
            .map((item) => (
              <li
                key={item.name}
                className='flex items-center justify-between gap-3 rounded-lg border p-2.5'
              >
                <span>{labelsFor(item.name)}</span>
                <span className='text-xs text-muted-foreground'>
                  {item.from.map((state) => state).join(', ')} →{' '}
                  {item.to.join(', ')}
                </span>
              </li>
            ))}
        </ul>
      </div>
      <div>
        <p className='font-medium'>{t('helpdesk.workflow.triggers')}</p>
        <ul className='mt-2 space-y-1.5'>
          {definition.triggers.map((trigger) => (
            <li
              key={trigger.name}
              className='flex items-center justify-between gap-3 rounded-lg border p-2.5'
            >
              <span className='font-mono text-xs'>{trigger.name}</span>
              <span className='text-xs text-muted-foreground'>
                {trigger.transition} · {trigger.when.join(', ')}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  function labelsFor(name: string): string {
    return t(`helpdesk.action.${name}`, { defaultValue: name });
  }
}

function parameterText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return '—';
  const serialized = JSON.stringify(value);
  return serialized ?? Object.prototype.toString.call(value);
}

function ExecutionDetails({
  detail,
}: {
  readonly detail: ExecutionDetail;
}): ReactElement {
  const { t } = useTranslation();
  const labels = useTicketLabels();
  const history = detail.history.transitions.map((entry) => ({
    transition: entry.transition,
    from: entry.from,
    to: entry.to,
  }));
  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap gap-2 text-sm'>
        <Badge variant='outline'>{labels.state(detail.state)}</Badge>
        <span className='text-muted-foreground'>
          {t('helpdesk.workflow.version', { version: detail.version ?? 0 })}
        </span>
        <span className='text-muted-foreground'>
          {labels.formatDate(detail.statusChangedAt)}
        </span>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t('helpdesk.workflow.diagram')}</CardTitle>
        </CardHeader>
        <CardContent>
          <LifecycleDiagram
            description={detail.description.description}
            currentState={detail.state}
            history={history}
            stateLabel={(item) => labels.state(item.name)}
            transitionLabel={(item) => labels.transition(item.name)}
            ariaLabel={t('helpdesk.workflow.diagram')}
            autoHeight
            showMiniMap={false}
          />
        </CardContent>
      </Card>
      <div className='grid gap-4 md:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>{t('helpdesk.workflow.history')}</CardTitle>
          </CardHeader>
          <CardContent>
            {detail.history.transitions.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                {t('helpdesk.detail.noHistory')}
              </p>
            ) : (
              <ol className='space-y-3 text-sm'>
                {detail.history.transitions.map((entry) => (
                  <li key={entry.id} className='flex gap-3'>
                    <span className='mt-1 size-2 shrink-0 rounded-full bg-primary' />
                    <div>
                      <p className='font-medium'>
                        {labels.transition(entry.transition)}
                      </p>
                      <p className='text-xs text-muted-foreground'>
                        {entry.from ? `${labels.state(entry.from)} → ` : ''}
                        {labels.state(entry.to)} · {labels.formatDate(entry.at)}{' '}
                        · <span className='font-mono'>{entry.actorId}</span>
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('helpdesk.workflow.effects')}</CardTitle>
          </CardHeader>
          <CardContent>
            {detail.history.effectRuns.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                {t('helpdesk.workflow.noEffects')}
              </p>
            ) : (
              <ul className='space-y-2 text-sm'>
                {detail.history.effectRuns.map((run) => (
                  <li
                    key={run.id}
                    className='flex items-center justify-between gap-3 rounded-lg border p-2.5'
                  >
                    <span className='font-mono text-xs'>{run.effect}</span>
                    <Badge
                      variant={
                        run.status === 'failed' || run.status === 'dead'
                          ? 'destructive'
                          : run.status === 'succeeded'
                            ? 'secondary'
                            : 'outline'
                      }
                    >
                      {run.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
