import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertCircleIcon, PlusIcon, TrendingUpIcon } from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router';

import { DataTable } from '@/components/data-table';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { OpportunityStageBadge } from '../opportunity-stage-badge.js';
import { CrmTableSkeleton } from '../table-skeleton.js';
import {
  OPPORTUNITY_STAGES,
  isOpportunityStage,
  type OpportunitiesOutletContext,
  type OpportunitySummary,
} from '../types.js';

export default function OpportunitiesPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();

  // The stage filter lives in the URL, so a refresh or a shared link restores it.
  const [searchParams, setSearchParams] = useSearchParams();
  const stageParam = searchParams.get('stage');
  const stage = isOpportunityStage(stageParam) ? stageParam : undefined;

  function changeStage(value: string | null): void {
    const next = new URLSearchParams(searchParams);
    if (value && value !== 'all') next.set('stage', value);
    else next.delete('stage');
    setSearchParams(next, { replace: true });
  }

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = JSON.stringify([stage ?? null, reloadCount]);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: readonly OpportunitySummary[];
    /** Whether this batch was fetched with the stage filter. */
    readonly filtered?: boolean;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = JSON.stringify([stage ?? null, reloadCount]);
    api
      .request<{ data: OpportunitySummary[] }>({
        path: 'opportunities',
        query: { stage },
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) {
            setResult({ key, rows: data, filtered: stage !== undefined });
          }
        },
        (error: unknown) => {
          if (!controller.signal.aborted) {
            setResult((previous) => ({ ...previous, key, error }));
          }
        },
      );
    return () => controller.abort();
  }, [api, stage, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const rows = result?.rows;
  const rowsFiltered = result?.filtered ?? false;

  const outletContext = useMemo<OpportunitiesOutletContext>(
    () => ({ rows, reload }),
    [rows, reload],
  );

  const amountFormat = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }),
    [locale],
  );

  const stageItems = useMemo(
    () => [
      { value: 'all', label: t('crm.opportunities.filter.allStages') },
      ...OPPORTUNITY_STAGES.map((value) => ({
        value,
        label: t(`crm.stages.${value}`),
      })),
    ],
    [t],
  );

  const columns = useMemo<ColumnDef<OpportunitySummary>[]>(
    () => [
      {
        accessorKey: 'name',
        enableHiding: false,
        header: t('crm.opportunities.fields.name'),
        cell: ({ row }) => (
          <Link
            to={{ pathname: String(row.original.id), search: location.search }}
            className='font-medium hover:underline'
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: 'customerName',
        header: t('crm.opportunities.fields.customer'),
        cell: ({ row }) =>
          row.original.customerName ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'amount',
        header: t('crm.opportunities.fields.amount'),
        cell: ({ row }) => (
          <span className='tabular-nums'>
            {amountFormat.format(row.original.amount)}
          </span>
        ),
      },
      {
        accessorKey: 'stage',
        header: t('crm.opportunities.fields.stage'),
        cell: ({ row }) => <OpportunityStageBadge stage={row.original.stage} />,
      },
    ],
    [amountFormat, location.search, t],
  );

  let content: ReactElement;
  if (error) {
    const forbidden = error instanceof ApiClientError && error.status === 403;
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('crm.error.title')}</AlertTitle>
        <AlertDescription>
          {forbidden ? t('crm.error.forbidden') : t('crm.error.requestFailed')}
        </AlertDescription>
        {forbidden ? null : (
          <AlertAction>
            <Button variant='outline' size='sm' onClick={reload}>
              {t('crm.actions.retry')}
            </Button>
          </AlertAction>
        )}
      </Alert>
    );
  } else if (rows === undefined) {
    content = <CrmTableSkeleton label={t('status.loading')} />;
  } else if (rows.length === 0 && !rowsFiltered) {
    content = (
      <Empty className='border'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <TrendingUpIcon />
          </EmptyMedia>
          <EmptyTitle>{t('crm.opportunities.emptyTitle')}</EmptyTitle>
          <EmptyDescription>
            {t('crm.opportunities.emptyDescription')}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            variant='outline'
            render={<Link to={{ pathname: 'new', search: location.search }} />}
            nativeButton={false}
          >
            <PlusIcon data-icon='inline-start' />
            {t('crm.actions.create')}
          </Button>
        </EmptyContent>
      </Empty>
    );
  } else {
    content = (
      <DataTable
        columns={columns}
        data={[...rows]}
        getRowId={(row) => String(row.id)}
        showSelectedCount={false}
        pagination={rows.length > 10}
        emptyMessage={
          <div className='flex flex-col items-center gap-2'>
            <span>{t('crm.opportunities.emptyFiltered')}</span>
            <Button variant='link' size='sm' onClick={() => changeStage('all')}>
              {t('crm.actions.clearFilters')}
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('crm.opportunities.title')}
        description={t('crm.opportunities.description')}
        actions={
          <Button
            render={<Link to={{ pathname: 'new', search: location.search }} />}
            nativeButton={false}
          >
            <PlusIcon data-icon='inline-start' />
            {t('crm.opportunities.create.title')}
          </Button>
        }
      />
      <div className='flex flex-wrap items-center gap-2'>
        <Select
          items={stageItems}
          value={stage ?? 'all'}
          onValueChange={(value) => changeStage(value)}
        >
          <SelectTrigger
            className='w-full sm:w-48'
            aria-label={t('crm.opportunities.fields.stage')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {stageItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {content}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}
