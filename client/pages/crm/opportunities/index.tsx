import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircleIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TargetIcon,
} from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { SessionExpiredAlert } from '@/components/session-expired-alert';
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
  DropdownMenuGroup,
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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useUrlSearch } from '@/hooks/use-url-search';

import { formatAmount } from '../format.js';
import { OpportunityStageBadge } from '../stage-badge.js';
import {
  isOpportunityStage,
  OPPORTUNITY_STAGES,
  type CrmList,
  type Opportunity,
  type OpportunityListOutletContext,
} from '../types.js';

const PAGE_SIZE = 100;

export default function OpportunitiesPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();
  const searchRef = useRef<HTMLInputElement>(null);

  const { searchParams, search, text, inputProps, updateParams, clear } =
    useUrlSearch();
  const stageParam = searchParams.get('stage');
  // Treat an unrecognized value as no filter.
  const stage = isOpportunityStage(stageParam) ? stageParam : undefined;

  function changeStage(value: string | null): void {
    updateParams((params) => {
      if (value && value !== 'all') params.set('stage', value);
      else params.delete('stage');
    });
  }

  const hasFilters = text.trim() !== '' || stage !== undefined;

  function clearFilters(): void {
    clear((params) => params.delete('stage'));
    searchRef.current?.focus();
  }

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = JSON.stringify([search, stage ?? null, reloadCount]);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: Opportunity[];
    readonly filtered?: boolean;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = JSON.stringify([search, stage ?? null, reloadCount]);
    api
      .request<CrmList<Opportunity>>({
        path: 'opportunities',
        query: { q: search || undefined, stage, pageSize: PAGE_SIZE },
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) {
            setResult({
              key,
              rows: data,
              filtered: search !== '' || stage !== undefined,
            });
          }
        },
        (error: unknown) => {
          if (!controller.signal.aborted) {
            setResult((previous) => ({ ...previous, key, error }));
          }
        },
      );
    return () => controller.abort();
  }, [api, search, stage, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const rows = result?.rows;
  const rowsFiltered = result?.filtered ?? false;

  const outletContext = useMemo<OpportunityListOutletContext>(
    () => ({ reload }),
    [reload],
  );

  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );
  const collator = useMemo(() => new Intl.Collator(locale), [locale]);

  const stageItems = [
    { value: 'all', label: t('opportunities.filters.allStages') },
    ...OPPORTUNITY_STAGES.map((value) => ({
      value,
      label: t(`opportunities.stage.${value}`),
    })),
  ];

  const columns = useMemo<ColumnDef<Opportunity>[]>(
    () => [
      {
        accessorKey: 'name',
        enableHiding: false,
        sortingFn: (a, b) => collator.compare(a.original.name, b.original.name),
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('opportunities.fields.name')}
          />
        ),
        cell: ({ row }) => (
          <span className='font-medium'>{row.original.name}</span>
        ),
      },
      {
        accessorKey: 'customerName',
        header: t('opportunities.fields.customer'),
        cell: ({ row }) =>
          row.original.customerName ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'amount',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('opportunities.fields.amount')}
          />
        ),
        cell: ({ row }) => (
          <span className='tabular-nums'>
            {formatAmount(row.original.amount)}
          </span>
        ),
      },
      {
        accessorKey: 'stage',
        header: t('opportunities.fields.stage'),
        cell: ({ row }) => <OpportunityStageBadge stage={row.original.stage} />,
      },
      {
        accessorKey: 'updatedAt',
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('opportunities.fields.updatedAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='whitespace-nowrap text-muted-foreground'>
            {dateFormat.format(new Date(row.original.updatedAt))}
          </span>
        ),
      },
      {
        id: 'actions',
        enableHiding: false,
        header: () => <span className='sr-only'>{t('actions.openMenu')}</span>,
        cell: ({ row }) => (
          <div className='flex justify-end'>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label={t('actions.openMenu')}
                  />
                }
              >
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    render={
                      <Link
                        to={{
                          pathname: `edit/${encodeURIComponent(row.original.id)}`,
                          search: location.search,
                        }}
                      />
                    }
                  >
                    <PencilIcon />
                    {t('actions.edit')}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [collator, dateFormat, location.search, t],
  );

  let content: ReactElement;
  if (error instanceof ApiClientError && error.status === 401) {
    content = <SessionExpiredAlert />;
  } else if (error) {
    const forbidden = error instanceof ApiClientError && error.status === 403;
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('opportunities.error.title')}</AlertTitle>
        <AlertDescription>
          {forbidden
            ? t('crm.error.forbidden')
            : t('opportunities.error.requestFailed')}
        </AlertDescription>
        {forbidden ? null : (
          <AlertAction>
            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                reload();
                searchRef.current?.focus();
              }}
            >
              {t('status.retry')}
            </Button>
          </AlertAction>
        )}
      </Alert>
    );
  } else if (rows === undefined) {
    content = <TableSkeleton label={t('status.loading')} />;
  } else if (rows.length === 0 && !rowsFiltered) {
    content = (
      <Empty className='border'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <TargetIcon />
          </EmptyMedia>
          <EmptyTitle>{t('opportunities.empty.title')}</EmptyTitle>
          <EmptyDescription>
            {t('opportunities.empty.description')}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            variant='outline'
            render={<Link to={{ pathname: 'new', search: location.search }} />}
            nativeButton={false}
          >
            <PlusIcon data-icon='inline-start' />
            {t('opportunities.create.action')}
          </Button>
        </EmptyContent>
      </Empty>
    );
  } else {
    content = (
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        showSelectedCount={false}
        emptyMessage={
          <div className='flex flex-col items-center gap-2'>
            <span>{t('opportunities.empty.noResults')}</span>
            <Button variant='link' size='sm' onClick={clearFilters}>
              {t('opportunities.filters.clear')}
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('opportunities.title')}
        description={t('opportunities.description')}
        actions={
          <Button
            render={<Link to={{ pathname: 'new', search: location.search }} />}
            nativeButton={false}
          >
            <PlusIcon data-icon='inline-start' />
            {t('opportunities.create.action')}
          </Button>
        }
      />
      <div className='flex flex-wrap items-center gap-2'>
        <InputGroup className='w-full sm:max-w-xs'>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            ref={searchRef}
            {...inputProps}
            placeholder={t('opportunities.search.placeholder')}
            aria-label={t('opportunities.search.label')}
          />
        </InputGroup>
        <Select
          items={stageItems}
          value={stage ?? 'all'}
          onValueChange={changeStage}
        >
          <SelectTrigger
            className='w-full sm:w-40'
            aria-label={t('opportunities.filters.stage')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {stageItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {hasFilters ? (
          <Button variant='ghost' onClick={clearFilters}>
            {t('opportunities.filters.clear')}
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

function TableSkeleton({ label }: { readonly label: string }): ReactElement {
  return (
    <div
      role='status'
      aria-label={label}
      className='overflow-hidden rounded-lg border'
    >
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          className='flex items-center gap-4 border-b px-4 py-3 last:border-b-0'
        >
          <Skeleton className='h-4 w-40' />
          <Skeleton className='h-4 w-24' />
          <Skeleton className='ml-auto h-4 w-28' />
        </div>
      ))}
    </div>
  );
}
