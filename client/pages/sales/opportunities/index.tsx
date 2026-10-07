import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { PencilIcon, PlusIcon, SearchIcon, TargetIcon } from 'lucide-react';
import { type ReactElement, useMemo, useRef } from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
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
import { Spinner } from '@/components/ui/spinner';
import { useUrlSearch } from '@/hooks/use-url-search';

import { formatAmount } from '../format.js';
import { SalesErrorAlert, TableSkeleton } from '../list-states.js';
import {
  OPPORTUNITY_STAGES,
  type OpportunitiesOutletContext,
  type Opportunity,
  type OpportunityStage,
} from '../types.js';
import { useSalesList } from '../use-sales-list.js';
import { OpportunityStageBadge } from './stage-badge.js';

const PAGE_SIZE = 100;

function isOpportunityStage(value: string | null): value is OpportunityStage {
  return OPPORTUNITY_STAGES.some((stage) => stage === value);
}

export default function OpportunitiesPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const location = useLocation();
  const searchRef = useRef<HTMLInputElement>(null);

  // The stage filter is a URL parameter like the search term, so a filtered list can be linked and reloaded.
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

  // Decide by the input's text, so "Clear filters" appears as soon as the first character is typed.
  const hasFilters = text.trim() !== '' || stage !== undefined;

  const { rows, loading, error, reload } = useSalesList<Opportunity>(
    'opportunities',
    {
      q: search || undefined,
      stage,
      pageSize: PAGE_SIZE,
    },
  );

  const collator = useMemo(() => new Intl.Collator(locale), [locale]);

  const columns = useMemo<ColumnDef<Opportunity>[]>(
    () => [
      {
        accessorKey: 'name',
        enableHiding: false,
        sortingFn: (a, b) =>
          collator.compare(a.original.name ?? '', b.original.name ?? ''),
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('sales.opportunity.name')}
          />
        ),
        cell: ({ row }) =>
          row.original.name ?? (
            <span className='text-muted-foreground'>
              {t('sales.opportunity.unnamed')}
            </span>
          ),
      },
      {
        accessorKey: 'customerName',
        header: t('sales.opportunity.customer'),
        cell: ({ row }) => (
          <Link
            to={{
              pathname: `/customers/${encodeURIComponent(row.original.customerId)}`,
              search: location.search,
            }}
            className='hover:underline'
          >
            {row.original.customerName}
          </Link>
        ),
      },
      {
        accessorKey: 'amount',
        header: t('sales.opportunity.amount'),
        cell: ({ row }) => (
          <span className='tabular-nums'>
            {formatAmount(row.original.amount, locale)}
          </span>
        ),
      },
      {
        accessorKey: 'stage',
        header: t('sales.opportunity.stage'),
        cell: ({ row }) => <OpportunityStageBadge stage={row.original.stage} />,
      },
      {
        id: 'actions',
        enableHiding: false,
        header: () => (
          <span className='sr-only'>{t('sales.actions.column')}</span>
        ),
        cell: ({ row }) => (
          <div className='flex justify-end'>
            <Button
              variant='ghost'
              size='icon-sm'
              aria-label={t('sales.opportunity.editNamed', {
                name: row.original.name ?? t('sales.opportunity.unnamed'),
              })}
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
            </Button>
          </div>
        ),
      },
    ],
    [collator, locale, location.search, t],
  );

  const stageItems = [
    { value: 'all', label: t('sales.filters.allStages') },
    ...OPPORTUNITY_STAGES.map((value) => ({
      value,
      label: t(`sales.stage.${value}`),
    })),
  ];

  function clearFilters(): void {
    clear((params) => params.delete('stage'));
    // The "Clear filters" button disappears along with the filters; move focus to the search box.
    searchRef.current?.focus();
  }

  const outletContext = useMemo<OpportunitiesOutletContext>(
    () => ({
      reload,
      onSaved: () => reload(),
      onNotFound: reload,
    }),
    [reload],
  );

  let content: ReactElement;
  if (error) {
    content = <SalesErrorAlert error={error} onRetry={reload} />;
  } else if (rows === undefined) {
    content = <TableSkeleton columns={4} />;
  } else if (rows.length === 0 && !hasFilters) {
    content = (
      <Empty className='border'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <TargetIcon />
          </EmptyMedia>
          <EmptyTitle>{t('sales.opportunity.empty.title')}</EmptyTitle>
          <EmptyDescription>
            {t('sales.opportunity.empty.description')}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            variant='outline'
            render={<Link to={{ pathname: 'new', search: location.search }} />}
            nativeButton={false}
          >
            <PlusIcon data-icon='inline-start' />
            {t('sales.opportunity.create')}
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
            <span>{t('sales.empty.noResults')}</span>
            <Button variant='link' size='sm' onClick={clearFilters}>
              {t('sales.filters.clear')}
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('sales.opportunity.title')}
        description={t('sales.opportunity.description')}
        actions={
          <Button
            render={<Link to={{ pathname: 'new', search: location.search }} />}
            nativeButton={false}
          >
            <PlusIcon data-icon='inline-start' />
            {t('sales.opportunity.create')}
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
            placeholder={t('sales.opportunity.search.placeholder')}
            aria-label={t('sales.opportunity.search.label')}
          />
        </InputGroup>
        <Select
          items={stageItems}
          value={stage ?? 'all'}
          onValueChange={changeStage}
        >
          <SelectTrigger
            className='w-full sm:w-40'
            aria-label={t('sales.filters.stage')}
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
            {t('sales.filters.clear')}
          </Button>
        ) : null}
        {/* Reloading keeps the old data and shows only a small Spinner here. */}
        {loading && rows !== undefined ? (
          <Spinner className='text-muted-foreground' />
        ) : null}
      </div>
      {content}

      {/* The create dialog and a row's edit dialog render here and get the list's refresh functions from context. */}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}
