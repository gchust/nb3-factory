import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircleIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  UsersIcon,
} from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { fetchContacts } from '@/components/crm/crm-api.js';
import type { Contact } from '@/components/crm/types.js';
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
import { Skeleton } from '@/components/ui/skeleton';

import type { ContactsOutletContext } from './types.js';

/** Route `/contacts`: the contact list. */
export default function ContactsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const location = useLocation();
  const { customers } = useCustomerOptions();
  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const [result, setResult] = useState<{
    readonly key: number;
    readonly contacts?: Contact[];
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    fetchContacts(api, {}, controller.signal).then(
      (contacts) => {
        if (!controller.signal.aborted)
          setResult({ key: reloadCount, contacts });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key: reloadCount, error });
      },
    );
    return () => controller.abort();
  }, [api, reloadCount]);

  const customerNames = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer.name])),
    [customers],
  );

  const loading = result?.key !== reloadCount;
  const error = loading ? undefined : result?.error;
  const contacts = result?.contacts;
  const status = error instanceof ApiClientError ? error.status : undefined;

  const columns = useMemo<ColumnDef<Contact>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t('crm.contact.fields.name'),
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
        accessorKey: 'contact',
        header: t('crm.contact.fields.contact'),
        cell: ({ row }) =>
          row.original.contact ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'customerId',
        header: t('crm.contact.fields.customer'),
        cell: ({ row }) => customerNames.get(row.original.customerId) ?? '—',
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

  const outletContext = useMemo<ContactsOutletContext>(
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
  } else if (contacts === undefined) {
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
  } else if (contacts.length === 0) {
    content = (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <UsersIcon />
          </EmptyMedia>
          <EmptyTitle>{t('crm.contact.empty.title')}</EmptyTitle>
          <EmptyDescription>
            {t('crm.contact.empty.description')}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else {
    content = (
      <DataTable
        columns={columns}
        data={contacts}
        getRowId={(row) => String(row.id)}
        showSelectedCount={false}
        emptyMessage={t('crm.contact.empty.title')}
      />
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('crm.contact.title')}
        description={t('crm.contact.description')}
        actions={
          <Button
            nativeButton={false}
            render={
              <Link
                to={{ pathname: 'new', search: location.search }}
                aria-label={t('crm.contact.create.action')}
              />
            }
          >
            <PlusIcon />
            {t('crm.contact.create.action')}
          </Button>
        }
      />
      {loading && contacts !== undefined ? (
        <p role='status' className='text-sm text-muted-foreground'>
          {t('crm.status.refreshing')}
        </p>
      ) : null}
      {content}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}
