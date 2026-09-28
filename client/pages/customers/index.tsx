import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient } from '@nocobase/app-client';
import type { ColumnDef } from '@tanstack/react-table';
import { PencilIcon, PlusIcon } from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useState } from 'react';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { DataTableViewOptions } from '@/components/data-table-view-options';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

import { listCustomers } from '../crm/api.js';
import type { Customer, CustomerDetail, Opportunity } from '../crm/types.js';
import { OpportunityDialog } from '../crm/opportunity-dialog.js';
import { CustomerDetailSheet } from './customer-detail-sheet.js';
import { CustomerDialog } from './customer-dialog.js';

export default function CustomersPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [customers, setCustomers] = useState<readonly Customer[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>(
    'loading',
  );
  const [listToken, setListToken] = useState(0);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailToken, setDetailToken] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogSession, setDialogSession] = useState(0);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [opportunityDialogOpen, setOpportunityDialogOpen] = useState(false);
  const [opportunitySession, setOpportunitySession] = useState(0);
  const [editingOpportunity, setEditingOpportunity] =
    useState<Opportunity | null>(null);
  const [opportunityCustomerId, setOpportunityCustomerId] = useState<
    number | null
  >(null);

  useEffect(() => {
    const controller = new AbortController();
    listCustomers(api, controller.signal).then(
      (rows) => {
        if (!controller.signal.aborted) {
          setCustomers(rows);
          setStatus('ready');
        }
      },
      () => {
        if (!controller.signal.aborted) {
          setStatus('failed');
        }
      },
    );
    return () => controller.abort();
  }, [api, listToken]);

  const columns = useMemo<ColumnDef<Customer, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.fields.name', { defaultValue: 'Name' })}
          />
        ),
        cell: ({ row }) => (
          <span className='font-medium'>{row.original.name}</span>
        ),
      },
      {
        accessorKey: 'industry',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.fields.industry', { defaultValue: 'Industry' })}
          />
        ),
        cell: ({ row }) =>
          row.original.industry ?? (
            <span className='text-muted-foreground'>
              {t('crm.customers.noIndustry', { defaultValue: 'No industry' })}
            </span>
          ),
      },
      {
        id: 'actions',
        enableHiding: false,
        cell: ({ row }) => (
          <div className='text-right'>
            <Button
              variant='ghost'
              size='icon-sm'
              aria-label={t('crm.actions.edit', { defaultValue: 'Edit' })}
              onClick={(event) => {
                event.stopPropagation();
                setEditing(row.original);
                setDialogSession((session) => session + 1);
                setDialogOpen(true);
              }}
            >
              <PencilIcon />
            </Button>
          </div>
        ),
      },
    ],
    [t],
  );

  function openCreate(): void {
    setEditing(null);
    setDialogSession((session) => session + 1);
    setDialogOpen(true);
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('crm.customers.title', { defaultValue: 'Customers' })}
        description={t('crm.customers.description', {
          defaultValue: 'The companies this team sells to.',
        })}
        actions={
          <Button onClick={openCreate}>
            <PlusIcon data-icon='inline-start' />
            {t('crm.customers.create', { defaultValue: 'New customer' })}
          </Button>
        }
      />

      {status === 'loading' ? (
        <div className='flex justify-center py-12'>
          <Spinner />
        </div>
      ) : null}
      {status === 'failed' ? (
        <p className='py-12 text-center text-sm text-muted-foreground'>
          {t('crm.errors.loadFailed', { defaultValue: 'Could not load.' })}
        </p>
      ) : null}
      {status === 'ready' ? (
        <DataTable
          columns={columns}
          data={customers as Customer[]}
          getRowId={(customer) => String(customer.id)}
          emptyMessage={t('crm.customers.empty', {
            defaultValue: 'No customers yet.',
          })}
          onRowClick={(row) => setDetailId(row.original.id)}
          toolbar={(table) => (
            <>
              <Input
                placeholder={t('crm.customers.search', {
                  defaultValue: 'Search customers…',
                })}
                value={
                  (table.getColumn('name')?.getFilterValue() as
                    string | undefined) ?? ''
                }
                onChange={(event) =>
                  table.getColumn('name')?.setFilterValue(event.target.value)
                }
                className='max-w-xs'
              />
              <DataTableViewOptions
                table={table}
                getColumnLabel={(column) =>
                  column.id === 'name'
                    ? t('crm.fields.name', { defaultValue: 'Name' })
                    : t('crm.fields.industry', { defaultValue: 'Industry' })
                }
              />
            </>
          )}
        />
      ) : null}

      <CustomerDetailSheet
        customerId={detailId}
        reloadToken={detailToken}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
        onEdit={(detail: CustomerDetail) => {
          setEditing(detail);
          setDialogSession((session) => session + 1);
          setDialogOpen(true);
        }}
        onAddOpportunity={(customerId: number) => {
          setEditingOpportunity(null);
          setOpportunityCustomerId(customerId);
          setOpportunitySession((session) => session + 1);
          setOpportunityDialogOpen(true);
        }}
        onEditOpportunity={(opportunity: Opportunity) => {
          setEditingOpportunity(opportunity);
          setOpportunityCustomerId(opportunity.customerId);
          setOpportunitySession((session) => session + 1);
          setOpportunityDialogOpen(true);
        }}
      />

      <OpportunityDialog
        key={opportunitySession}
        open={opportunityDialogOpen}
        opportunity={editingOpportunity}
        customers={customers}
        defaultCustomerId={opportunityCustomerId ?? undefined}
        onOpenChange={setOpportunityDialogOpen}
        onSaved={() => setDetailToken((token) => token + 1)}
      />

      <CustomerDialog
        key={dialogSession}
        open={dialogOpen}
        customer={editing}
        onOpenChange={setDialogOpen}
        onSaved={() => {
          setStatus('loading');
          setListToken((token) => token + 1);
          setDetailToken((token) => token + 1);
        }}
      />
    </PageContainer>
  );
}
