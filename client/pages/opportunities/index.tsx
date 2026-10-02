import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircleIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  TargetIcon,
} from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router';

import { AmountText } from '@/components/crm/amount-text.js';
import { fetchOpportunities } from '@/components/crm/crm-api.js';
import { StageBadge } from '@/components/crm/stage-badge.js';
import {
  isOpportunityStage,
  type Opportunity,
} from '@/components/crm/types.js';
import { useCustomerOptions } from '@/components/crm/use-customer-options.js';
import { DataTable } from '@/components/data-table';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Empty,
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
import { Skeleton } from '@/components/ui/skeleton';

import type { OpportunitiesOutletContext } from './types.js';

const ALL_STAGES = 'all';
const STAGE_PARAM = 'stage';

/** Route `/opportunities`: the opportunity list, filterable by stage. */
export default function OpportunitiesPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { customers } = useCustomerOptions();

  const rawStage = searchParams.get(STAGE_PARAM);
  const stageFilter = isOpportunityStage(rawStage) ? rawStage : ALL_STAGES;

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const [result, setResult] = useState<{
    readonly key: number;
    readonly opportunities?: Opportunity[];
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    fetchOpportunities(
      api,
      stageFilter === ALL_STAGES ? {} : { stage: stageFilter },
      controller.signal,
    ).then(
      (opportunities) => {
        if (!controller.signal.aborted) {
          setResult({ key: reloadCount, opportunities });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key: reloadCount, error });
      },
    );
    return () => controller.abort();
  }, [api, reloadCount, stageFilter]);

  const customerNames = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer.name])),
    [customers],
  );

  const loading = result?.key !== reloadCount;
  const error = loading ? undefined : result?.error;
  const opportunities = result?.opportunities;
  const status = error instanceof ApiClientError ? error.status : undefined;

  const stageItems = useMemo(
    () => [
      { value: ALL_STAGES, label: t('crm.opportunity.filter.allStages') },
      ...(['following', 'won', 'lost'] as const).map((stage) => ({
        value: stage,
        label: t(`crm.stage.${stage}`),
      })),
    ],
    [t],
  );

  const setStageFilter = (value: string) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value === ALL_STAGES) next.delete(STAGE_PARAM);
        else next.set(STAGE_PARAM, value);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  };

  const columns = useMemo<ColumnDef<Opportunity>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t('crm.opportunity.fields.name'),
        enableHiding: false,
        cell: ({ row }) => (
          <Link
            className='font-medium hover:underline'
            to={{
              pathname: `${row.original.id}/edit`,
              search: location.search,
            }}
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: 'customerId',
        header: t('crm.opportunity.fields.customer'),
        cell: ({ row }) => customerNames.get(row.original.customerId) ?? '—',
      },
      {
        accessorKey: 'amount',
        header: t('crm.opportunity.fields.amount'),
        cell: ({ row }) => (
          <span className='block text-right tabular-nums'>
            <AmountText amount={row.original.amount} />
          </span>
        ),
      },
      {
        accessorKey: 'stage',
        header: t('crm.opportunity.fields.stage'),
        cell: ({ row }) => <StageBadge stage={row.original.stage} />,
      },
      {
        id: 'actions',
        enableHiding: false,
        header: () => (
          <span className='sr-only'>{t('crm.actions.actions')}</span>
        ),
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant='ghost'
                  size='icon-sm'
                  aria-label={t('crm.actions.forRecord', {
                    name: row.original.name,
                  })}
                />
              }
            >
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem
                render={
                  <Link
                    to={{
                      pathname: `${row.original.id}/edit`,
                      search: location.search,
                    }}
                  />
                }
              >
                <PencilIcon />
                {t('crm.actions.edit')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [customerNames, location.search, t],
  );

  const outletContext = useMemo<OpportunitiesOutletContext>(
    () => ({ reload }),
    [reload],
  );

  let content: ReactElement;
  if (error) {
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {status === 403
            ? t('crm.error.forbidden')
            : t('crm.error.requestFailed')}
        </AlertDescription>
        {status === 403 ? null : (
          <AlertAction>
            <Button variant='outline' size='sm' onClick={reload}>
              {t('crm.actions.retry')}
            </Button>
          </AlertAction>
        )}
      </Alert>
    );
  } else if (opportunities === undefined) {
    content = (
      <div
        role='status'
        aria-label={t('crm.status.loading')}
        className='space-y-3'
      >
        <Skeleton className='h-10 w-full' />
        <Skeleton className='h-10 w-full' />
        <Skeleton className='h-10 w-full' />
      </div>
    );
  } else if (opportunities.length === 0) {
    content = (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <TargetIcon />
          </EmptyMedia>
          <EmptyTitle>
            {stageFilter === ALL_STAGES
              ? t('crm.opportunity.empty.title')
              : t('crm.opportunity.empty.filteredTitle')}
          </EmptyTitle>
          <EmptyDescription>
            {stageFilter === ALL_STAGES
              ? t('crm.opportunity.empty.description')
              : t('crm.opportunity.empty.filteredDescription')}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else {
    content = (
      <DataTable
        columns={columns}
        data={opportunities}
        getRowId={(row) => String(row.id)}
        showSelectedCount={false}
        emptyMessage={t('crm.opportunity.empty.title')}
      />
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('crm.opportunity.title')}
        description={t('crm.opportunity.description')}
        actions={
          <Button
            nativeButton={false}
            render={
              <Link
                to={{ pathname: 'new', search: location.search }}
                aria-label={t('crm.opportunity.create.action')}
              />
            }
          >
            <PlusIcon />
            {t('crm.opportunity.create.action')}
          </Button>
        }
      />
      <div className='flex items-center gap-2'>
        <label
          className='text-sm font-medium text-muted-foreground'
          htmlFor='opportunity-stage-filter'
        >
          {t('crm.opportunity.fields.stage')}
        </label>
        <Select
          items={stageItems}
          value={stageFilter}
          onValueChange={(value) => {
            if (value) setStageFilter(value);
          }}
        >
          <SelectTrigger
            id='opportunity-stage-filter'
            size='sm'
            className='w-40'
            aria-label={t('crm.opportunity.filter.stageAria')}
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
      {loading && opportunities !== undefined ? (
        <p role='status' className='text-sm text-muted-foreground'>
          {t('crm.status.refreshing')}
        </p>
      ) : null}
      {content}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}
