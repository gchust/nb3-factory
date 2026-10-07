import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { Building2Icon, PlusIcon, SearchIcon } from 'lucide-react';
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
import { Spinner } from '@/components/ui/spinner';
import { useUrlSearch } from '@/hooks/use-url-search';

import { SalesErrorAlert, TableSkeleton } from '../list-states.js';
import type { Customer, CustomersOutletContext } from '../types.js';
import { useSalesList } from '../use-sales-list.js';

// The endpoint pages every list and caps a page at 100 records. This page sorts and paginates in the browser, so it
// asks for the largest page; a list that outgrows it would move to server pagination.
const PAGE_SIZE = 100;

export default function CustomersPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const location = useLocation();
  const searchRef = useRef<HTMLInputElement>(null);

  // The search term lives in the URL behind a search box that keeps its own text, so typing, input methods, back and
  // forward all stay in step.
  const { search, text, inputProps, clear } = useUrlSearch();
  const hasFilters = text.trim() !== '';

  const { rows, loading, error, reload } = useSalesList<Customer>('customers', {
    q: search || undefined,
    pageSize: PAGE_SIZE,
  });

  // The default sort compares character codes, so Chinese does not sort by pinyin; use the current language's
  // collation.
  const collator = useMemo(() => new Intl.Collator(locale), [locale]);

  const columns = useMemo<ColumnDef<Customer>[]>(
    () => [
      {
        accessorKey: 'name',
        enableHiding: false,
        sortingFn: (a, b) => collator.compare(a.original.name, b.original.name),
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('sales.customer.name')}
          />
        ),
        cell: ({ row }) => (
          // The name links to the detail child route and keeps the current query parameters.
          <Link
            to={{ pathname: row.original.id, search: location.search }}
            className='font-medium hover:underline'
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: 'industry',
        header: t('sales.customer.industry'),
        cell: ({ row }) =>
          row.original.industry ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
    ],
    [collator, location.search, t],
  );

  const outletContext = useMemo<CustomersOutletContext>(
    () => ({
      reload,
      onSaved: () => reload(),
      onNotFound: reload,
    }),
    [reload],
  );

  const empty = (
    <Empty className='border'>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <Building2Icon />
        </EmptyMedia>
        <EmptyTitle>{t('sales.customer.empty.title')}</EmptyTitle>
        <EmptyDescription>
          {t('sales.customer.empty.description')}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {/* The page header already has the primary button, so use outline here: one primary button per view. */}
        <Button
          variant='outline'
          render={<Link to={{ pathname: 'new', search: location.search }} />}
          nativeButton={false}
        >
          <PlusIcon data-icon='inline-start' />
          {t('sales.customer.create')}
        </Button>
      </EmptyContent>
    </Empty>
  );

  let content: ReactElement;
  if (error) {
    content = <SalesErrorAlert error={error} onRetry={reload} />;
  } else if (rows === undefined) {
    content = <TableSkeleton columns={2} />;
  } else if (rows.length === 0 && !hasFilters) {
    content = empty;
  } else {
    content = (
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        // No row selection on this page, so no "0 of N row(s) selected" summary.
        showSelectedCount={false}
        emptyMessage={
          <div className='flex flex-col items-center gap-2'>
            <span>{t('sales.empty.noResults')}</span>
            <Button variant='link' size='sm' onClick={() => clear()}>
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
        title={t('sales.customer.title')}
        description={t('sales.customer.description')}
        actions={
          <Button
            render={<Link to={{ pathname: 'new', search: location.search }} />}
            nativeButton={false}
          >
            <PlusIcon data-icon='inline-start' />
            {t('sales.customer.create')}
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
            placeholder={t('sales.search.placeholder')}
            aria-label={t('sales.search.label')}
          />
        </InputGroup>
        {hasFilters ? (
          <Button variant='ghost' onClick={() => clear()}>
            {t('sales.filters.clear')}
          </Button>
        ) : null}
        {/* Reloading keeps the old data and shows only a small Spinner here. */}
        {loading && rows !== undefined ? (
          <Spinner className='text-muted-foreground' />
        ) : null}
      </div>
      {content}

      {/* The create dialog, a row's edit dialog and the detail drawer render here and get the list's refresh functions from context. */}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}
