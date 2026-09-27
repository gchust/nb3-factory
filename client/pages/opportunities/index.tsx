import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircleIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  TrendingUpIcon,
} from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { Spinner } from '@/components/ui/spinner';

import { fetchOpportunities } from '../sales/api.js';
import { formatNumber } from '../sales/format.js';
import { ListSkeleton } from '../sales/list-skeleton.js';
import { STAGE_LABEL_KEYS } from '../sales/stage.js';
import { OpportunityStageBadge } from '../sales/stage-badge.js';
import {
  OPPORTUNITY_STAGES,
  type Opportunity,
  isOpportunityStage,
  type SalesListOutletContext,
} from '../sales/types.js';

const ALL_STAGES = 'all';

/** Route `/opportunities`: the opportunity list, filterable by stage through `?stage=`. */
export default function OpportunitiesPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const stageParam = searchParams.get('stage');
  const stage = isOpportunityStage(stageParam) ? stageParam : undefined;

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const [result, setResult] = useState<{
    readonly key: number;
    readonly rows?: Opportunity[];
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    fetchOpportunities(api, { stage }, controller.signal).then(
      (rows) => {
        if (!controller.signal.aborted) setResult({ key: reloadCount, rows });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key: reloadCount, error });
      },
    );
    return () => controller.abort();
  }, [api, reloadCount, stage]);

  const loading = result?.key !== reloadCount;
  const error = loading ? undefined : result?.error;
  const rows = result?.rows;

  const outletContext = useMemo<SalesListOutletContext>(
    () => ({ reload }),
    [reload],
  );

  const collator = useMemo(() => new Intl.Collator(locale), [locale]);

  const stageItems = useMemo(
    () => [
      { value: ALL_STAGES, label: t('sales.filters.allStages') },
      ...OPPORTUNITY_STAGES.map((value) => ({
        value,
        label: t(STAGE_LABEL_KEYS[value]),
      })),
    ],
    [t],
  );

  const changeStage = (value: string | null): void => {
    const next = new URLSearchParams(searchParams);
    if (value === null || value === ALL_STAGES) next.delete('stage');
    else next.set('stage', value);
    setSearchParams(next, { replace: true });
  };

  const clearStage = (): void => {
    const next = new URLSearchParams(searchParams);
    next.delete('stage');
    setSearchParams(next, { replace: true });
  };

  const columns = useMemo<ColumnDef<Opportunity>[]>(
    () => [
      {
        accessorKey: 'name',
        enableHiding: false,
        sortingFn: (a, b) => collator.compare(a.original.name, b.original.name),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('sales.name')} />
        ),
        cell: ({ row }) => (
          <Link
            to={`${row.original.id}/edit${location.search}`}
            className='font-medium hover:underline'
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: 'customerName',
        enableHiding: false,
        header: t('sales.customer'),
        cell: ({ row }) =>
          row.original.customerName ?? (
            <span className='text-muted-foreground'>
              {t('sales.emptyValue')}
            </span>
          ),
      },
      {
        accessorKey: 'amount',
        enableHiding: false,
        header: () => <div className='text-right'>{t('sales.amount')}</div>,
        cell: ({ row }) => (
          <div className='text-right tabular-nums'>
            {formatNumber(locale, row.original.amount)}
          </div>
        ),
      },
      {
        accessorKey: 'stage',
        enableHiding: false,
        header: t('sales.stage.label'),
        cell: ({ row }) => <OpportunityStageBadge stage={row.original.stage} />,
      },
      {
        id: 'actions',
        enableHiding: false,
        header: () => (
          <span className='sr-only'>{t('sales.actions.label')}</span>
        ),
        cell: ({ row }) => (
          <div className='flex justify-end'>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label={t('sales.actions.more', {
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
                    <Link to={`${row.original.id}/edit${location.search}`} />
                  }
                >
                  <PencilIcon />
                  {t('sales.actions.edit')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [collator, locale, location.search, t],
  );

  let content: ReactElement;
  if (error) {
    const forbidden = error instanceof ApiClientError && error.status === 403;
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('sales.opportunities.errorTitle')}</AlertTitle>
        <AlertDescription>
          {forbidden
            ? t('sales.errorForbidden')
            : t('sales.errorRequestFailed')}
        </AlertDescription>
        {forbidden ? null : (
          <AlertAction>
            <Button variant='outline' size='sm' onClick={reload}>
              {t('status.retry')}
            </Button>
          </AlertAction>
        )}
      </Alert>
    );
  } else if (rows === undefined) {
    content = <ListSkeleton label={t('status.loading')} />;
  } else if (rows.length === 0) {
    content = (
      <Empty className='border'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <TrendingUpIcon />
          </EmptyMedia>
          <EmptyTitle>
            {stage === undefined
              ? t('sales.opportunities.emptyTitle')
              : t('sales.opportunities.emptyFilteredTitle')}
          </EmptyTitle>
          <EmptyDescription>
            {stage === undefined
              ? t('sales.opportunities.emptyDescription')
              : t('sales.opportunities.emptyFilteredDescription')}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {stage === undefined ? (
            <Button
              variant='outline'
              render={
                <Link to={{ pathname: 'new', search: location.search }} />
              }
              nativeButton={false}
            >
              <PlusIcon data-icon='inline-start' />
              {t('sales.opportunities.create')}
            </Button>
          ) : (
            <Button variant='outline' onClick={clearStage}>
              {t('sales.filters.clearStage')}
            </Button>
          )}
        </EmptyContent>
      </Empty>
    );
  } else {
    content = (
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => String(row.id)}
        showSelectedCount={false}
      />
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('sales.opportunities.title')}
        description={t('sales.opportunities.description')}
        actions={
          <Button
            render={<Link to={{ pathname: 'new', search: location.search }} />}
            nativeButton={false}
          >
            <PlusIcon data-icon='inline-start' />
            {t('sales.opportunities.create')}
          </Button>
        }
      />
      <div className='flex flex-wrap items-center gap-2'>
        <Select
          items={stageItems}
          value={stage ?? ALL_STAGES}
          onValueChange={changeStage}
        >
          <SelectTrigger className='w-48' aria-label={t('sales.filters.stage')}>
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
        {stage !== undefined ? (
          <Button variant='ghost' onClick={clearStage}>
            {t('sales.filters.clearStage')}
          </Button>
        ) : null}
        {loading && rows !== undefined ? (
          <Spinner className='text-muted-foreground' />
        ) : null}
      </div>
      {content}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}
