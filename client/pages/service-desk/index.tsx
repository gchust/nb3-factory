import { LifecycleDiagram } from '#components/lifecycle-diagram';
import { PageHeader } from '#components/page-header';
import { Button } from '#components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import {
  WorkflowDefinitionDetail,
  WorkflowManagementLayout,
  type WorkflowTab,
} from '#extensions/nocobase-workflow-management/layout';
import { WorkflowExecutionDetail } from '#extensions/nocobase-workflow-management/execution-detail';
import {
  WorkflowExecutionList,
  type WorkflowExecutionRow,
} from '#extensions/nocobase-workflow-management/execution-list';
import type { LifecycleDescription } from '@nocobase/lifecycle';
import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeftIcon } from 'lucide-react';
import { type ReactElement } from 'react';
import { useSearchParams } from 'react-router';

import {
  useTicketRequest,
  type DataBody,
  type RequestState,
  type TicketDefinition,
  type TicketDetail,
  type TicketExecutions,
} from '../tickets/api.js';
import {
  TicketError,
  TicketLoading,
  TicketStatusBadge,
} from '../tickets/shared.js';
import { useTicketLabels } from '../tickets/hooks.js';

interface LifecycleBody {
  readonly definition: TicketDefinition;
  readonly description: LifecycleDescription;
}

/**
 * The repair-handling process, as its administrators see it.
 *
 * One sidebar entry with two views. The definitions view draws the state machine the runtime actually enforces and
 * lists the parameters it reads; the executions view shows every recorded transition and, for one ticket, the exact
 * path it took with the notices that were queued. Both views read through the `lifecycle` action, so a caller who may
 * not administer the process cannot open either.
 *
 * The tab and the selected execution live in the query string rather than in separate routes: the entry keeps its one
 * sidebar item and one page grant, and a link to `?tab=executions&ticket=<id>` reopens the same place.
 */
export default function ServiceDeskPage(): ReactElement {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab: WorkflowTab =
    params.get('tab') === 'executions' ? 'executions' : 'definitions';
  const ticketId = params.get('ticket') ?? undefined;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const pageSize = 20;

  const lifecycle =
    useTicketRequest<DataBody<LifecycleBody>>('tickets/lifecycle');
  const executions = useTicketRequest<DataBody<TicketExecutions>>(
    'tickets/executions',
    { page, pageSize },
    tab === 'executions' && !ticketId,
  );
  const selected = useTicketRequest<DataBody<TicketDetail>>(
    `tickets/${encodeURIComponent(ticketId ?? '')}`,
    undefined,
    Boolean(ticketId),
  );

  const setTab = (next: WorkflowTab): void => {
    setParams(
      (old) => {
        const result = new URLSearchParams(old);
        result.set('tab', next);
        result.delete('ticket');
        result.delete('page');
        return result;
      },
      { replace: true },
    );
  };

  const definition = lifecycle.data?.data.definition;
  const description = lifecycle.data?.data.description;

  return (
    <WorkflowManagementLayout
      title={t('tickets.serviceDesk.title')}
      description={t('tickets.serviceDesk.description')}
      labels={{
        definitions: t('tickets.serviceDesk.definitions'),
        executions: t('tickets.serviceDesk.executions'),
      }}
      tab={tab}
      onTabChange={setTab}
      detail={Boolean(ticketId)}
    >
      <TicketError error={lifecycle.error} retry={lifecycle.reload} />
      {!definition || !description ? (
        lifecycle.error ? null : (
          <TicketLoading />
        )
      ) : tab === 'definitions' ? (
        <WorkflowDefinitionDetail
          diagramTitle={t('tickets.serviceDesk.diagram')}
          parametersTitle={t('tickets.serviceDesk.parameters')}
          diagram={
            <div className='h-[32rem] min-h-[24rem] w-full'>
              <LifecycleDiagram
                ariaLabel={t('tickets.serviceDesk.diagram')}
                description={description}
                currentState={description.initialStates[0]}
                endLabel={t('tickets.serviceDesk.end')}
                stateLabel={(state) =>
                  t(`tickets.status.${state.name}`, {
                    defaultValue: state.title,
                  })
                }
                transitionLabel={(transition) =>
                  t(`tickets.transition.${transition.name}`, {
                    defaultValue: transition.title,
                  })
                }
              />
            </div>
          }
          parameters={<DefinitionParameters definition={definition} />}
        />
      ) : ticketId ? (
        <ExecutionDetail
          ticketId={ticketId}
          description={description}
          request={selected}
          onBack={() =>
            setParams(
              (old) => {
                const result = new URLSearchParams(old);
                result.delete('ticket');
                return result;
              },
              { replace: true },
            )
          }
        />
      ) : (
        <ExecutionList
          request={executions}
          page={page}
          pageSize={pageSize}
          onSelect={(id) =>
            setParams(
              (old) => {
                const result = new URLSearchParams(old);
                result.set('tab', 'executions');
                result.set('ticket', id);
                return result;
              },
              { replace: true },
            )
          }
          onPage={(next) =>
            setParams(
              (old) => {
                const result = new URLSearchParams(old);
                result.set('page', String(next));
                return result;
              },
              { replace: true },
            )
          }
        />
      )}
    </WorkflowManagementLayout>
  );
}

/** The lifecycle's own parameters, as the runtime reads them. They are code-owned, so this is a read-only view. */
function DefinitionParameters({
  definition,
}: {
  readonly definition: TicketDefinition;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='flex flex-col gap-4'>
      <dl className='flex flex-col gap-3'>
        <div className='flex items-center justify-between gap-4'>
          <dt className='text-sm'>{t('tickets.serviceDesk.overdueHours')}</dt>
          <dd className='text-sm font-medium'>
            {definition.parameters.overdueHours}
          </dd>
        </div>
        <div className='flex items-center justify-between gap-4'>
          <dt className='text-sm'>{t('tickets.serviceDesk.maxReopenCount')}</dt>
          <dd className='text-sm font-medium'>
            {definition.parameters.maxReopenCount}
          </dd>
        </div>
      </dl>
      <p className='text-xs text-muted-foreground'>
        {t('tickets.serviceDesk.parametersHint')}
      </p>
      <div className='flex flex-wrap gap-2'>
        {definition.states.map((state) => (
          <TicketStatusBadge key={state} status={state} size='sm' />
        ))}
      </div>
    </div>
  );
}

function ExecutionList({
  request,
  page,
  pageSize,
  onSelect,
  onPage,
}: {
  readonly request: RequestState<DataBody<TicketExecutions>>;
  readonly page: number;
  readonly pageSize: number;
  readonly onSelect: (id: string) => void;
  readonly onPage: (page: number) => void;
}): ReactElement {
  const { t } = useTranslation();
  const labels = useTicketLabels();
  const data = request.data?.data;
  const rows: WorkflowExecutionRow[] = (data?.transitions ?? []).map((row) => ({
    id: row.id,
    record: (
      <Button
        variant='link'
        className='h-auto p-0'
        onClick={() => onSelect(row.recordId)}
      >
        {row.recordTitle || `#${row.recordId.slice(0, 8)}`}
      </Button>
    ),
    workflow: t('tickets.serviceDesk.workflowName'),
    state: <TicketStatusBadge status={row.to} size='sm' />,
    createdAt: labels.date(row.at),
  }));
  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  return (
    <>
      <TicketError error={request.error} retry={request.reload} />
      <WorkflowExecutionList
        rows={rows}
        loaded={Boolean(data)}
        loading={request.loading}
        filters={null}
        empty={t('tickets.serviceDesk.noExecutions')}
        labels={{
          refresh: t('tickets.serviceDesk.refresh'),
          record: t('tickets.title'),
          workflow: t('tickets.serviceDesk.workflow'),
          state: t('tickets.statusLabel'),
          createdAt: t('tickets.serviceDesk.ranAt'),
          previous: t('tickets.serviceDesk.previous'),
          next: t('tickets.serviceDesk.next'),
        }}
        order='newest'
        onSort={() => undefined}
        onRefresh={request.reload}
        pagination={t('tickets.serviceDesk.pageOf', { page, total })}
        previousDisabled={request.loading || page <= 1}
        nextDisabled={request.loading || page >= lastPage}
        onPrevious={() => onPage(page - 1)}
        onNext={() => onPage(page + 1)}
      />
    </>
  );
}

/** One ticket's exact path: the transitions it recorded, the state each left it in, and the notices queued. */
function ExecutionDetail({
  ticketId,
  description,
  request,
  onBack,
}: {
  readonly ticketId: string;
  readonly description: LifecycleDescription;
  readonly request: RequestState<DataBody<TicketDetail>>;
  readonly onBack: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const labels = useTicketLabels();
  const detail = request.data?.data;

  if (request.error) {
    return (
      <>
        <Button variant='ghost' className='w-fit' onClick={onBack}>
          <ArrowLeftIcon />
          {t('tickets.serviceDesk.backToList')}
        </Button>
        <TicketError error={request.error} retry={request.reload} />
      </>
    );
  }
  if (!detail) {
    return <TicketLoading />;
  }

  return (
    <>
      <PageHeader
        title={detail.ticket.title}
        description={
          <span className='flex items-center gap-2'>
            <TicketStatusBadge status={detail.ticket.status} />
            <span className='text-xs text-muted-foreground'>
              #{detail.ticket.id.slice(0, 8)}
            </span>
          </span>
        }
        actions={
          <Button variant='outline' onClick={onBack}>
            <ArrowLeftIcon />
            {t('tickets.serviceDesk.backToList')}
          </Button>
        }
      />
      <WorkflowExecutionDetail
        key={ticketId}
        transitions={detail.history.transitions.map((entry) => ({
          ...entry,
          actorId: entry.actorId,
        }))}
        state={detail.ticket.status}
        effects={detail.history.effectRuns.map((run) => ({
          id: run.id,
          effect: run.effect,
          status: run.status,
          attempts: run.attempts,
          maxAttempts: run.maxAttempts,
          error: run.error,
        }))}
        labels={{
          processDiagram: t('tickets.serviceDesk.diagram'),
          history: t('tickets.serviceDesk.history'),
          historyHint: t('tickets.serviceDesk.historyHint'),
          step: t('tickets.serviceDesk.step'),
          transition: t('tickets.serviceDesk.transition'),
          from: t('tickets.serviceDesk.from'),
          to: t('tickets.serviceDesk.to'),
          actor: t('tickets.serviceDesk.actor'),
          time: t('tickets.serviceDesk.time'),
          noHistory: t('tickets.detail.noHistory'),
          effects: t('tickets.serviceDesk.effects'),
          effect: t('tickets.serviceDesk.effect'),
          state: t('tickets.serviceDesk.state'),
          attempts: t('tickets.serviceDesk.attempts'),
          error: t('tickets.serviceDesk.error'),
          noEffects: t('tickets.serviceDesk.noEffects'),
          executionParameters: t('tickets.serviceDesk.executionParameters'),
          snapshotHint: t('tickets.serviceDesk.snapshotHint'),
          showStep: (step: number) =>
            t('tickets.serviceDesk.showStep', { step }),
        }}
        stateLabel={(name) =>
          t(`tickets.status.${name}`, { defaultValue: name })
        }
        transitionLabel={(name) =>
          t(`tickets.transition.${name}`, { defaultValue: name })
        }
        dateLabel={(at) => labels.date(at)}
        effectStatusLabel={(status) =>
          t(`tickets.effectStatus.${status}`, { defaultValue: status })
        }
        renderDiagram={({ current, history }) => (
          <div className='h-96 min-h-72 w-full'>
            <LifecycleDiagram
              ariaLabel={t('tickets.serviceDesk.diagram')}
              description={description}
              currentState={current}
              history={history.map((entry) => ({
                transition: entry.transition,
                from: entry.from,
                to: entry.to,
              }))}
              endLabel={t('tickets.serviceDesk.end')}
              stateLabel={(state) =>
                t(`tickets.status.${state.name}`, { defaultValue: state.title })
              }
              transitionLabel={(transition) =>
                t(`tickets.transition.${transition.name}`, {
                  defaultValue: transition.title,
                })
              }
            />
          </div>
        )}
      />
    </>
  );
}

/** Kept for the empty state: a card the caller can see when the lifecycle description is unavailable. */
export function ServiceDeskUnavailable(): ReactElement {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('tickets.serviceDesk.title')}</CardTitle>
        <CardDescription>
          {t('tickets.serviceDesk.unavailable')}
        </CardDescription>
      </CardHeader>
      <CardContent />
    </Card>
  );
}
