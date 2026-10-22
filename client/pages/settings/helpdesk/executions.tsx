import { useTranslation } from '@nocobase/i18n/client';
import { SearchIcon } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router';
import { Input } from '#components/ui/input';
import { WorkflowExecutionList } from '#extensions/nocobase-workflow-management/execution-list';
import { useApiData } from '../../helpdesk/api.js';
import {
  HelpdeskError,
  StatusLabel,
  TransitionLabel,
} from '../../helpdesk/shared.js';
import { formatDateTime } from '../../helpdesk/display.js';
import type { WorkflowExecutionRow } from '../../helpdesk/types.js';

export default function HelpdeskExecutionsPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const detail = /\/executions\/[^/]+$/.test(location.pathname);
  const page = Math.max(1, Number(params.get('page')) || 1);
  const pageSize = 20;
  const order = params.get('order') === 'oldest' ? 'oldest' : 'newest';
  const [queryDraft, setQueryDraft] = useState<{
    key: string;
    value: string;
  }>();
  const query =
    queryDraft?.key === location.key
      ? queryDraft.value
      : (params.get('ticketId') ?? '');
  const setQuery = (value: string) =>
    setQueryDraft({ key: location.key, value });
  const [composing, setComposing] = useState(false);
  useEffect(() => {
    if (composing || query === (params.get('ticketId') ?? '')) return;
    const timer = setTimeout(() => {
      setParams(
        (old) => {
          const next = new URLSearchParams(old);
          if (query) next.set('ticketId', query);
          else next.delete('ticketId');
          next.delete('page');
          return next;
        },
        { replace: true },
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [query, composing, params, setParams]);
  const remote = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    ...(params.get('ticketId') ? { ticketId: params.get('ticketId')! } : {}),
  });
  const request = useApiData<{
    data: readonly WorkflowExecutionRow[];
    meta: { total: number };
  }>(`helpdesk/workflow/executions?${remote}`);

  const rows = request.data?.data ?? [];
  const total = request.data?.meta.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const setPage = (next: number) => {
    setParams(
      (old) => {
        const result = new URLSearchParams(old);
        if (next <= 1) result.delete('page');
        else result.set('page', String(next));
        return result;
      },
      { replace: true },
    );
  };
  if (detail) return <Outlet />;

  return (
    <div className='flex flex-col gap-4'>
      <HelpdeskError error={request.error} retry={request.reload} />
      <WorkflowExecutionList
        rows={rows.map((row) => ({
          id: String(row.transition.id),
          record: row.ticket ? (
            <Link
              className='font-medium underline-offset-4 hover:underline'
              to={`/helpdesk/tickets/${encodeURIComponent(row.ticket.id)}`}
            >
              {row.ticket.ticketNo} · {row.ticket.title}
            </Link>
          ) : (
            row.transition.recordId
          ),
          workflow: (
            <Link
              className='underline-offset-4 hover:underline'
              to={`/settings/helpdesk-workflow/executions/${row.transition.id}`}
            >
              <TransitionLabel transition={row.transition.transition} />
            </Link>
          ),
          state: <StatusLabel status={row.transition.to} />,
          createdAt: formatDateTime(row.transition.at, i18n.language),
        }))}
        loaded={Boolean(request.data)}
        loading={request.loading}
        filters={
          <div className='relative w-full sm:w-72'>
            <SearchIcon className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
            <Input
              className='pl-8'
              value={query}
              aria-label={t('helpdesk.workflow.ticketSearch')}
              placeholder={t('helpdesk.workflow.ticketSearch')}
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={() => setComposing(false)}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        }
        empty={t('helpdesk.workflow.noExecutions')}
        labels={{
          refresh: t('helpdesk.actions.refresh'),
          record: t('helpdesk.workflow.record'),
          workflow: t('helpdesk.workflow.transition'),
          state: t('helpdesk.workflow.toState'),
          createdAt: t('helpdesk.workflow.time'),
          previous: t('helpdesk.actions.previous'),
          next: t('helpdesk.actions.next'),
        }}
        order={order}
        onSort={() => {
          setParams(
            (old) => {
              const next = new URLSearchParams(old);
              if (order === 'newest') next.set('order', 'oldest');
              else next.delete('order');
              return next;
            },
            { replace: true },
          );
        }}
        onRefresh={request.reload}
        pagination={t('helpdesk.workflow.pageOf', {
          page,
          pageCount,
          total,
        })}
        previousDisabled={page <= 1}
        nextDisabled={page >= pageCount}
        onPrevious={() => setPage(page - 1)}
        onNext={() => setPage(page + 1)}
      />
    </div>
  );
}
