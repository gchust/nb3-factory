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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

import { fetchOpportunities } from '../api.js';
import { formatAmount, formatDate } from '../format.js';
import { StageBadge } from '../stage-badge.js';
import { isOpportunityStage, OPPORTUNITY_STAGES } from '../types.js';
import type { OpportunitiesOutletContext, Opportunity } from '../types.js';

const ALL_STAGES = 'all';

export default function OpportunitiesPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();
  const searchRef = useRef<HTMLInputElement>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const urlSearch = searchParams.get('q') ?? '';
  const stageParam = searchParams.get('stage') ?? '';
  const stage = isOpportunityStage(stageParam) ? stageParam : undefined;

  const paramsRef = useRef(searchParams);
  useEffect(() => {
    paramsRef.current = searchParams;
  }, [searchParams]);
  function updateParams(mutate: (params: URLSearchParams) => void): void {
    const next = new URLSearchParams(paramsRef.current);
    mutate(next);
    paramsRef.current = next;
    setSearchParams(next, { replace: true });
  }

  const [text, setText] = useState(urlSearch);
  const [ownSearch, setOwnSearch] = useState(urlSearch);
  const [seenSearch, setSeenSearch] = useState(urlSearch);
  if (urlSearch !== seenSearch) {
    setSeenSearch(urlSearch);
    if (urlSearch !== ownSearch) {
      setOwnSearch(urlSearch);
      setText(urlSearch);
    }
  }
  const searchTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(searchTimerRef.current), []);

  function scheduleSearch(value: string): void {
    window.clearTimeout(searchTimerRef.current);
    const addressSearch = (): string =>
      new URLSearchParams(window.location.search).get('q') ?? '';
    const startSearch = paramsRef.current.get('q') ?? '';
    const startAddress = addressSearch();
    searchTimerRef.current = window.setTimeout(() => {
      if (
        (paramsRef.current.get('q') ?? '') !== startSearch ||
        addressSearch() !== startAddress
      ) {
        return;
      }
      setOwnSearch(value);
      updateParams((params) => {
        if (value) params.set('q', value);
        else params.delete('q');
      });
    }, 300);
  }

  const hasFilters = text.trim() !== '' || stage !== undefined;

  function clearFilters(): void {
    window.clearTimeout(searchTimerRef.current);
    setText('');
    setOwnSearch('');
    updateParams((params) => {
      params.delete('q');
      params.delete('stage');
    });
    searchRef.current?.focus();
  }

  const search = urlSearch.trim();
  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = JSON.stringify([search, stageParam, reloadCount]);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: readonly Opportunity[];
    readonly filtered?: boolean;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = JSON.stringify([search, stageParam, reloadCount]);
    fetchOpportunities(api, {
      search: search || undefined,
      stage,
      signal: controller.signal,
    }).then(
      (rows) => {
        if (!controller.signal.aborted) {
          setResult({
            key,
            rows,
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
  }, [api, search, stage, stageParam, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const rows = result?.rows;
  const rowsFiltered = result?.filtered ?? false;

  const outletContext = useMemo<OpportunitiesOutletContext>(
    () => ({ reload }),
    [reload],
  );

  const stageItems = useMemo(
    () => [
      { value: ALL_STAGES, label: t('crm.filters.allStages') },
      ...OPPORTUNITY_STAGES.map((value) => ({
        value,
        label: t(`crm.stage.${value}`),
      })),
    ],
    [t],
  );

  const columns = useMemo<ColumnDef<Opportunity>[]>(
    () => [
      {
        accessorKey: 'name',
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.opportunity.fields.name')}
          />
        ),
        cell: ({ row }) => (
          <Link
            to={{
              pathname: `${row.original.id}/edit`,
              search: location.search,
            }}
            className='font-medium hover:underline'
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: 'customerName',
        header: t('crm.opportunity.fields.customer'),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {row.original.customerName}
          </span>
        ),
      },
      {
        accessorKey: 'amount',
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.opportunity.fields.amount')}
            className='justify-end'
          />
        ),
        cell: ({ row }) => (
          <div className='text-right tabular-nums'>
            {formatAmount(locale, row.original.amount)}
          </div>
        ),
      },
      {
        accessorKey: 'stage',
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.opportunity.fields.stage')}
          />
        ),
        cell: ({ row }) => <StageBadge stage={row.original.stage} />,
      },
      {
        accessorKey: 'updatedAt',
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.opportunity.fields.updatedAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='whitespace-nowrap text-muted-foreground'>
            {formatDate(locale, row.original.updatedAt)}
          </span>
        ),
      },
      {
        id: 'actions',
        enableHiding: false,
        header: () => (
          <span className='sr-only'>
            {t('crm.opportunities.actions.label')}
          </span>
        ),
        cell: ({ row }) => (
          <div className='flex justify-end'>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label={t('crm.opportunities.actions.more', {
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
          </div>
        ),
      },
    ],
    [location.search, locale, t],
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
          <EmptyTitle>{t('crm.opportunities.empty.title')}</EmptyTitle>
          <EmptyDescription>
            {t('crm.opportunities.empty.description')}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            variant='outline'
            render={<Link to={{ pathname: 'new', search: location.search }} />}
            nativeButton={false}
          >
            <PlusIcon data-icon='inline-start' />
            {t('crm.opportunities.create.action')}
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
        emptyMessage={
          <div className='flex flex-col items-center gap-2'>
            <span>{t('crm.opportunities.empty.noResults')}</span>
            <Button variant='link' size='sm' onClick={clearFilters}>
              {t('crm.filters.clear')}
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
            {t('crm.opportunities.create.action')}
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
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              if (!(event.nativeEvent as InputEvent).isComposing) {
                scheduleSearch(event.target.value);
              }
            }}
            onCompositionEnd={(event) =>
              scheduleSearch(event.currentTarget.value)
            }
            placeholder={t('crm.opportunities.search.placeholder')}
            aria-label={t('crm.opportunities.search.label')}
          />
        </InputGroup>
        <Select
          items={stageItems}
          value={stage ?? ALL_STAGES}
          onValueChange={(value) => {
            if (value === null) return;
            updateParams((params) => {
              if (value === ALL_STAGES) params.delete('stage');
              else params.set('stage', value);
            });
          }}
        >
          <SelectTrigger
            className='w-full sm:w-44'
            aria-label={t('crm.opportunities.filters.stage')}
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
        {hasFilters ? (
          <Button variant='ghost' onClick={clearFilters}>
            {t('crm.filters.clear')}
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
