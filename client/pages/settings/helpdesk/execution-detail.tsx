import type { LifecycleDescription } from '@nocobase/lifecycle';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { Link, useParams } from 'react-router';
import { BackButton } from '#components/back-button';
import { LifecycleDiagram } from '#components/lifecycle-diagram';
import { PageHeader } from '#components/page-header';
import { Button } from '#components/ui/button';
import {
  WorkflowExecutionDetail,
  type WorkflowEffectEntry,
  type WorkflowHistoryEntry,
} from '#extensions/nocobase-workflow-management/execution-detail';
import { useApiData } from '../../helpdesk/api.js';
import {
  HelpdeskError,
  StatusLabel,
  TransitionLabel,
} from '../../helpdesk/shared.js';
import type {
  WorkflowDefinition,
  WorkflowExecutionDetailData,
} from '../../helpdesk/types.js';
import { WorkflowLoading } from './shared.js';
import { formatDateTime } from '../../helpdesk/display.js';

const effectEntries = (
  data: WorkflowExecutionDetailData,
): readonly WorkflowEffectEntry[] =>
  data.effectRuns.map((run) => ({
    id: String(run.id),
    effect: run.effect,
    status: run.status,
    attempts: run.attempts,
    maxAttempts: run.maxAttempts,
    error: run.error,
  }));

export default function HelpdeskExecutionDetailPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const { transitionId } = useParams();
  const numericId = Number(transitionId);
  const request = useApiData<{ data: WorkflowExecutionDetailData }>(
    Number.isInteger(numericId) && numericId > 0
      ? `helpdesk/workflow/executions/${numericId}`
      : null,
  );
  const definition = useApiData<{ data: WorkflowDefinition }>(
    'helpdesk/workflow/definition',
  );
  const data = request.data?.data;
  const def = definition.data?.data;
  const history = data?.history ?? [];
  const state =
    history[history.length - 1]?.to ?? data?.transition.to ?? 'open';

  return (
    <div className='flex flex-col gap-4'>
      <BackButton to='/settings/helpdesk-workflow/executions'>
        {t('helpdesk.workflow.backToExecutions')}
      </BackButton>
      <PageHeader
        title={t('helpdesk.workflow.executionDetail')}
        description={
          data ? (
            <span className='flex flex-wrap items-center gap-2'>
              <span className='font-medium'>
                <TransitionLabel transition={data.transition.transition} />
              </span>
              <span>·</span>
              <StatusLabel status={data.transition.to} />
            </span>
          ) : (
            t('helpdesk.workflow.executionDetailDescription')
          )
        }
        actions={
          data?.ticket ? (
            <Button
              nativeButton={false}
              variant='outline'
              render={
                <Link
                  to={`/helpdesk/tickets/${encodeURIComponent(data.ticket.id)}`}
                />
              }
            >
              {t('helpdesk.workflow.openTicket')}
            </Button>
          ) : undefined
        }
      />
      <HelpdeskError error={request.error} retry={request.reload} />
      <HelpdeskError error={definition.error} retry={definition.reload} />
      {request.loading && !data ? (
        <WorkflowLoading />
      ) : !data ? (
        <p className='text-sm text-muted-foreground'>
          {t('helpdesk.workflow.executionMissing')}
        </p>
      ) : !def ? (
        <WorkflowLoading />
      ) : (
        <WorkflowExecutionDetail<WorkflowHistoryEntry>
          transitions={history.map((entry) => ({
            id: String(entry.id),
            version: entry.version,
            at: entry.at,
            transition: entry.transition,
            from: entry.from ?? null,
            to: entry.to,
            actorId: entry.actorId,
          }))}
          state={state}
          effects={effectEntries(data)}
          parameters={
            <div className='flex flex-col gap-3'>
              <dl className='grid gap-2 text-sm sm:grid-cols-2'>
                <div>
                  <dt className='text-xs text-muted-foreground'>
                    {t('helpdesk.workflow.executionId')}
                  </dt>
                  <dd>{data.transition.id}</dd>
                </div>
                <div>
                  <dt className='text-xs text-muted-foreground'>
                    {t('helpdesk.workflow.ticket')}
                  </dt>
                  <dd>{data.ticket?.ticketNo ?? data.transition.recordId}</dd>
                </div>
                <div>
                  <dt className='text-xs text-muted-foreground'>
                    {t('helpdesk.workflow.actor')}
                  </dt>
                  <dd>{data.transition.actorId}</dd>
                </div>
                <div>
                  <dt className='text-xs text-muted-foreground'>
                    {t('helpdesk.workflow.time')}
                  </dt>
                  <dd>{formatDateTime(data.transition.at, i18n.language)}</dd>
                </div>
              </dl>
              <div>
                <p className='mb-2 text-xs text-muted-foreground'>
                  {t('helpdesk.workflow.recordedInput')}
                </p>
                {data.transition.input &&
                Object.keys(data.transition.input).length ? (
                  <dl className='flex flex-col gap-1 rounded-md bg-muted/40 p-3 text-sm'>
                    {Object.entries(data.transition.input).map(
                      ([key, value]) => (
                        <div key={key} className='flex gap-2'>
                          <dt className='shrink-0 text-muted-foreground'>
                            {key}:
                          </dt>
                          <dd className='break-words'>
                            {typeof value === 'string'
                              ? value
                              : JSON.stringify(value)}
                          </dd>
                        </div>
                      ),
                    )}
                  </dl>
                ) : (
                  <p className='text-sm text-muted-foreground'>
                    {t('helpdesk.workflow.noRecordedInput')}
                  </p>
                )}
              </div>
              <Button
                nativeButton={false}
                variant='outline'
                size='sm'
                render={<Link to='/settings/helpdesk-workflow/definitions' />}
              >
                {t('helpdesk.workflow.viewCurrentPolicy')}
              </Button>
            </div>
          }
          labels={{
            processDiagram: t('helpdesk.workflow.diagram'),
            history: t('helpdesk.workflow.history'),
            historyHint: t('helpdesk.workflow.historyHint'),
            step: t('helpdesk.workflow.step'),
            transition: t('helpdesk.workflow.transition'),
            from: t('helpdesk.workflow.fromState'),
            to: t('helpdesk.workflow.toState'),
            actor: t('helpdesk.workflow.actor'),
            time: t('helpdesk.workflow.time'),
            noHistory: t('helpdesk.workflow.noHistory'),
            effects: t('helpdesk.workflow.effects'),
            effect: t('helpdesk.workflow.effect'),
            state: t('helpdesk.workflow.effectState'),
            attempts: t('helpdesk.workflow.attempts'),
            error: t('helpdesk.workflow.error'),
            noEffects: t('helpdesk.workflow.noEffects'),
            executionParameters: t('helpdesk.workflow.executionParameters'),
            snapshotHint: t('helpdesk.workflow.snapshotHint'),
            showStep: (step) => t('helpdesk.workflow.showStep', { step }),
          }}
          stateLabel={(name) => <StatusLabel status={name} />}
          transitionLabel={(name) => <TransitionLabel transition={name} />}
          dateLabel={(at) => formatDateTime(at, i18n.language)}
          effectStatusLabel={(status) =>
            t(`helpdesk.workflow.effectStatus.${status}`, {
              defaultValue: status,
            })
          }
          renderDiagram={({ current, history: stepHistory }) => (
            <LifecycleDiagram
              ariaLabel={t('helpdesk.workflow.diagram')}
              description={def as unknown as LifecycleDescription}
              currentState={current}
              history={stepHistory.map((entry) => ({
                transition: entry.transition,
                from: entry.from,
                to: entry.to,
              }))}
              stateLabel={(state) =>
                t(`helpdesk.status.${state.name}`, {
                  defaultValue: state.title,
                })
              }
              transitionLabel={(transition) =>
                t(`helpdesk.transition.${transition.name}`, {
                  defaultValue: transition.title,
                })
              }
            />
          )}
        />
      )}
    </div>
  );
}
