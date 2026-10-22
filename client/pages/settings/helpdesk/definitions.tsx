import { useTranslation } from '@nocobase/i18n/client';
import { useMemo, useState, type ReactElement } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { Input } from '#components/ui/input';
import { WorkflowDefinitionList } from '#extensions/nocobase-workflow-management/definition-list';
import { useApiData } from '../../helpdesk/api.js';
import { HelpdeskError } from '../../helpdesk/shared.js';
import type { WorkflowDefinition } from '../../helpdesk/types.js';
import { WorkflowLoading } from './shared.js';

export default function HelpdeskDefinitionsPage(): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  const detail = /\/definitions\/[^/]+$/.test(location.pathname);
  const definition = useApiData<{ data: WorkflowDefinition }>(
    'helpdesk/workflow/definition',
  );
  const executions = useApiData<{ meta: { total: number } }>(
    'helpdesk/workflow/executions?pageSize=1',
  );
  const [query, setQuery] = useState('');
  const [ascending, setAscending] = useState(true);
  const def = definition.data?.data;
  const rows = useMemo(() => {
    if (!def) return [];
    if (
      query &&
      !`${def.name} ${t('helpdesk.workflow.ticketProcess')}`
        .toLowerCase()
        .includes(query.toLowerCase())
    ) {
      return [];
    }
    return [
      {
        id: def.name,
        name: def.name,
        title: (
          <Link
            className='font-medium underline-offset-4 hover:underline'
            to={`/settings/helpdesk-workflow/definitions/${encodeURIComponent(def.name)}`}
          >
            {t('helpdesk.workflow.ticketProcess')}
          </Link>
        ),
        activity: executions.data?.meta.total ?? 0,
      },
    ];
  }, [def, executions.data?.meta.total, query, t]);

  if (detail) return <Outlet />;

  return (
    <div className='flex flex-col gap-4'>
      <HelpdeskError error={definition.error} retry={definition.reload} />
      <HelpdeskError error={executions.error} retry={executions.reload} />
      {definition.loading && !def ? (
        <WorkflowLoading />
      ) : (
        <WorkflowDefinitionList
          rows={rows}
          search={
            <Input
              value={query}
              aria-label={t('helpdesk.workflow.search')}
              placeholder={t('helpdesk.workflow.search')}
              onChange={(event) => setQuery(event.target.value)}
            />
          }
          loaded={!definition.loading && Boolean(def)}
          loading={definition.loading}
          empty={t('helpdesk.workflow.noDefinitions')}
          labels={{
            refresh: t('helpdesk.actions.refresh'),
            workflow: t('helpdesk.workflow.workflow'),
            executionCount: t('helpdesk.workflow.executionCount'),
            executionActivity: t('helpdesk.workflow.executionActivity'),
          }}
          sort={{ ascending }}
          onSort={() => setAscending((value) => !value)}
          onRefresh={() => {
            definition.reload();
            executions.reload();
          }}
        />
      )}
    </div>
  );
}
