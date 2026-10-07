import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { PencilIcon, PlusIcon, SearchIcon, UsersIcon } from 'lucide-react';
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
import type { Contact, ContactsOutletContext } from '../types.js';
import { useSalesList } from '../use-sales-list.js';

const PAGE_SIZE = 100;

export default function ContactsPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const location = useLocation();
  const searchRef = useRef<HTMLInputElement>(null);

  const { search, text, inputProps, clear } = useUrlSearch();
  const hasFilters = text.trim() !== '';

  const { rows, loading, error, reload } = useSalesList<Contact>('contacts', {
    q: search || undefined,
    pageSize: PAGE_SIZE,
  });

  const collator = useMemo(() => new Intl.Collator(locale), [locale]);

  const columns = useMemo<ColumnDef<Contact>[]>(
    () => [
      {
        accessorKey: 'name',
        enableHiding: false,
        sortingFn: (a, b) => collator.compare(a.original.name, b.original.name),
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('sales.contact.name')}
          />
        ),
        cell: ({ row }) => (
          // A contact has no page of its own, so its name is plain text and the row's action opens the edit dialog.
          <span className='font-medium'>{row.original.name}</span>
        ),
      },
      {
        accessorKey: 'contactInfo',
        header: t('sales.contact.contactInfo'),
        cell: ({ row }) =>
          row.original.contactInfo ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'customerName',
        header: t('sales.contact.customer'),
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
              aria-label={t('sales.contact.editNamed', {
                name: row.original.name,
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
    [collator, location.search, t],
  );

  const outletContext = useMemo<ContactsOutletContext>(
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
            <UsersIcon />
          </EmptyMedia>
          <EmptyTitle>{t('sales.contact.empty.title')}</EmptyTitle>
          <EmptyDescription>
            {t('sales.contact.empty.description')}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            variant='outline'
            render={<Link to={{ pathname: 'new', search: location.search }} />}
            nativeButton={false}
          >
            <PlusIcon data-icon='inline-start' />
            {t('sales.contact.create')}
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
        title={t('sales.contact.title')}
        description={t('sales.contact.description')}
        actions={
          <Button
            render={<Link to={{ pathname: 'new', search: location.search }} />}
            nativeButton={false}
          >
            <PlusIcon data-icon='inline-start' />
            {t('sales.contact.create')}
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
            placeholder={t('sales.contact.search.placeholder')}
            aria-label={t('sales.contact.search.label')}
          />
        </InputGroup>
        {hasFilters ? (
          <Button variant='ghost' onClick={() => clear()}>
            {t('sales.filters.clear')}
          </Button>
        ) : null}
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
