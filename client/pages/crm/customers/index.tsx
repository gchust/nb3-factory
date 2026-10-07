import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon, SearchIcon, UploadIcon } from 'lucide-react';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { deleteCustomer, fetchCustomers } from '../api.js';
import { ConfirmDialog } from '../confirm-dialog.js';
import { EmptyState, LevelBadge, RequestError } from '../components.js';
import { CustomerFormDialog } from '../customer-form.js';
import { formatDate, LEVEL_LABEL_KEYS } from '../format.js';
import { useDebounced, useLoad } from '../use-load.js';
import { CUSTOMER_LEVELS, type CustomerView } from '../types.js';

const PAGE_SIZE = 20;

export default function CustomersPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const location = useLocation();
  const canEdit = useCan({
    resource: { type: 'composite', id: 'crm' },
    action: 'edit',
  });
  const canDelete = useCan({
    resource: { type: 'composite', id: 'crm' },
    action: 'delete',
  });

  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<CustomerView | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<CustomerView | null>(null);
  const debouncedSearch = useDebounced(search, 300);

  // The list stays mounted while a child route (detail or import) is shown, so
  // a row created there would otherwise stay invisible until a manual reload.
  // `location.key` changes on every navigation, so returning to the list
  // refetches it.
  const { data, error, loading, reload } = useLoad(
    (signal) =>
      fetchCustomers(
        api,
        {
          search: debouncedSearch || undefined,
          level: level || undefined,
          page,
          pageSize: PAGE_SIZE,
          sort: 'newest',
        },
        signal,
      ),
    `${debouncedSearch}|${level}|${page}|${location.key}`,
  );

  const rows = data?.data ?? [];
  const meta = data?.meta;

  return (
    <PageContainer>
      <PageHeader
        title={t('crm.customers.title')}
        description={t('crm.customers.description')}
        actions={
          <div className='flex gap-2'>
            <Button
              nativeButton={false}
              render={
                <Link to={{ pathname: 'import', search: location.search }} />
              }
              variant='outline'
            >
              <UploadIcon data-icon='inline-start' />
              {t('crm.customers.import.action')}
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <PlusIcon data-icon='inline-start' />
              {t('crm.customers.create.action')}
            </Button>
          </div>
        }
      />

      <div className='flex flex-wrap items-center gap-2'>
        <div className='relative w-full sm:max-w-xs'>
          <SearchIcon className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            className='pl-8'
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder={t('crm.customers.searchPlaceholder')}
            value={search}
          />
        </div>
        <div className='flex flex-wrap gap-1'>
          <Button
            onClick={() => {
              setLevel('');
              setPage(1);
            }}
            size='sm'
            variant={level === '' ? 'secondary' : 'ghost'}
          >
            {t('crm.customers.levelAll')}
          </Button>
          {CUSTOMER_LEVELS.map((value) => (
            <Button
              key={value}
              onClick={() => {
                setLevel(value);
                setPage(1);
              }}
              size='sm'
              variant={level === value ? 'secondary' : 'ghost'}
            >
              {t(LEVEL_LABEL_KEYS[value])}
            </Button>
          ))}
        </div>
      </div>

      {error ? <RequestError error={error} onRetry={reload} /> : null}

      <div className='rounded-xl border border-border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('crm.customers.column.name')}</TableHead>
              <TableHead>{t('crm.customers.column.level')}</TableHead>
              <TableHead>{t('crm.customers.column.industry')}</TableHead>
              <TableHead>{t('crm.customers.column.owner')}</TableHead>
              <TableHead>{t('crm.customers.column.phone')}</TableHead>
              <TableHead>{t('crm.customers.column.createdAt')}</TableHead>
              <TableHead className='text-right'>
                {t('crm.column.actions')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <EmptyState colSpan={7}>
                {loading ? t('crm.loading') : t('crm.customers.empty')}
              </EmptyState>
            ) : (
              rows.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className='font-medium'>
                    <Link
                      className='underline-offset-4 hover:underline'
                      to={{
                        pathname: String(customer.id),
                        search: location.search,
                      }}
                    >
                      {customer.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <LevelBadge level={customer.level} />
                  </TableCell>
                  <TableCell>{customer.industry || '—'}</TableCell>
                  <TableCell>
                    {customer.ownerName || customer.ownerId || '—'}
                  </TableCell>
                  <TableCell>{customer.phone || '—'}</TableCell>
                  <TableCell>{formatDate(customer.createdAt)}</TableCell>
                  <TableCell>
                    <div className='flex justify-end gap-1'>
                      <Button
                        nativeButton={false}
                        render={
                          <Link
                            to={{
                              pathname: String(customer.id),
                              search: location.search,
                            }}
                          />
                        }
                        size='sm'
                        variant='ghost'
                      >
                        {t('actions.view')}
                      </Button>
                      <Button
                        disabled={!canEdit.can}
                        onClick={() => {
                          setEditing(customer);
                          setFormOpen(true);
                        }}
                        size='sm'
                        variant='ghost'
                      >
                        {t('actions.edit')}
                      </Button>
                      {canDelete.can ? (
                        <Button
                          disabled={!canDelete.can}
                          onClick={() => setDeleting(customer)}
                          size='sm'
                          variant='ghost'
                        >
                          {t('actions.delete')}
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {meta ? (
        <div className='flex items-center justify-between text-sm text-muted-foreground'>
          <span>{t('crm.pagination.total', { total: meta.total })}</span>
          <div className='flex items-center gap-2'>
            <Button
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              size='sm'
              variant='outline'
            >
              {t('crm.pagination.previous')}
            </Button>
            <span>
              {t('crm.pagination.page', {
                page: meta.page,
                pageCount: Math.max(1, Math.ceil(meta.total / meta.pageSize)),
              })}
            </span>
            <Button
              disabled={page * PAGE_SIZE >= meta.total}
              onClick={() => setPage((current) => current + 1)}
              size='sm'
              variant='outline'
            >
              {t('crm.pagination.next')}
            </Button>
          </div>
        </div>
      ) : null}

      {formOpen ? (
        <CustomerFormDialog
          key={editing ? `edit-${editing.id}` : 'new'}
          customer={editing}
          onOpenChange={(open) => {
            setFormOpen(open);
            if (!open) setEditing(null);
          }}
          onSaved={() => {
            reload();
          }}
          open
        />
      ) : null}

      {deleting ? (
        <ConfirmDialog
          confirmLabel={t('actions.delete')}
          description={t('crm.customers.delete.description', {
            name: deleting.name,
          })}
          onConfirm={async () => {
            await deleteCustomer(api, deleting.id);
            reload();
          }}
          onOpenChange={(open) => {
            if (!open) setDeleting(null);
          }}
          open={deleting != null}
          title={t('crm.customers.delete.title')}
        />
      ) : null}

      <Outlet />
    </PageContainer>
  );
}
