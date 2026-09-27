import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircleIcon,
  ContactIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
} from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import { Link, Outlet, useLocation } from 'react-router';

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
import { Spinner } from '@/components/ui/spinner';

import { fetchContacts } from '../sales/api.js';
import { ListSkeleton } from '../sales/list-skeleton.js';
import type { Contact, SalesListOutletContext } from '../sales/types.js';

/** Route `/contacts`: the contact list. */
export default function ContactsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const location = useLocation();

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const [result, setResult] = useState<{
    readonly key: number;
    readonly rows?: Contact[];
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    fetchContacts(api, undefined, controller.signal).then(
      (rows) => {
        if (!controller.signal.aborted) setResult({ key: reloadCount, rows });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key: reloadCount, error });
      },
    );
    return () => controller.abort();
  }, [api, reloadCount]);

  const loading = result?.key !== reloadCount;
  const error = loading ? undefined : result?.error;
  const rows = result?.rows;

  const outletContext = useMemo<SalesListOutletContext>(
    () => ({ reload }),
    [reload],
  );

  const collator = useMemo(() => new Intl.Collator(), []);

  const columns = useMemo<ColumnDef<Contact>[]>(
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
        accessorKey: 'contactInfo',
        header: t('sales.contactInfo'),
        cell: ({ row }) =>
          row.original.contactInfo ?? (
            <span className='text-muted-foreground'>
              {t('sales.emptyValue')}
            </span>
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
    [collator, location.search, t],
  );

  let content: ReactElement;
  if (error) {
    const forbidden = error instanceof ApiClientError && error.status === 403;
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('sales.contacts.errorTitle')}</AlertTitle>
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
            <ContactIcon />
          </EmptyMedia>
          <EmptyTitle>{t('sales.contacts.emptyTitle')}</EmptyTitle>
          <EmptyDescription>
            {t('sales.contacts.emptyDescription')}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            variant='outline'
            render={<Link to={{ pathname: 'new', search: location.search }} />}
            nativeButton={false}
          >
            <PlusIcon data-icon='inline-start' />
            {t('sales.contacts.create')}
          </Button>
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
        title={t('sales.contacts.title')}
        description={t('sales.contacts.description')}
        actions={
          <Button
            render={<Link to={{ pathname: 'new', search: location.search }} />}
            nativeButton={false}
          >
            <PlusIcon data-icon='inline-start' />
            {t('sales.contacts.create')}
          </Button>
        }
      />
      {loading && rows !== undefined ? (
        <Spinner className='self-end text-muted-foreground' />
      ) : null}
      {content}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}
