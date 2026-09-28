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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';

import { listCustomers, listOpportunities } from '../crm/api.js';
import { formatAmount } from '../crm/format.js';
import { STAGE_BADGE, STAGE_ORDER } from '../crm/stage.js';
import type { Customer, Opportunity, OpportunityStage } from '../crm/types.js';
import { OpportunityDialog } from '../crm/opportunity-dialog.js';

type StageFilter = 'all' | OpportunityStage;

export default function OpportunitiesPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const api = useApiClient();
  const [opportunities, setOpportunities] = useState<readonly Opportunity[]>(
    [],
  );
  const [customers, setCustomers] = useState<readonly Customer[]>([]);
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>(
    'loading',
  );
  const [listToken, setListToken] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogSession, setDialogSession] = useState(0);
  const [editing, setEditing] = useState<Opportunity | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      listOpportunities(
        api,
        stageFilter === 'all' ? undefined : stageFilter,
        controller.signal,
      ),
      listCustomers(api, controller.signal),
    ]).then(
      ([opportunityRows, customerRows]) => {
        if (!controller.signal.aborted) {
          setOpportunities(opportunityRows);
          setCustomers(customerRows);
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
  }, [api, listToken, stageFilter]);

  const customerNames = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer.name])),
    [customers],
  );

  const stageLabel = useMemo(
    () => (stage: OpportunityStage) =>
      t(`crm.stage.${stage}`, { defaultValue: stage }),
    [t],
  );

  const columns = useMemo<ColumnDef<Opportunity, unknown>[]>(
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
        id: 'customer',
        accessorFn: (opportunity) =>
          customerNames.get(opportunity.customerId) ?? '',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.fields.customer', { defaultValue: 'Customer' })}
          />
        ),
        cell: ({ row }) =>
          customerNames.get(row.original.customerId) ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'stage',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.fields.stage', { defaultValue: 'Stage' })}
          />
        ),
        cell: ({ row }) => (
          <Badge variant={STAGE_BADGE[row.original.stage]}>
            {stageLabel(row.original.stage)}
          </Badge>
        ),
      },
      {
        accessorKey: 'amount',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.fields.amount', { defaultValue: 'Amount' })}
            className='justify-end'
          />
        ),
        cell: ({ row }) => (
          <div className='text-right font-medium tabular-nums'>
            {formatAmount(row.original.amount, i18n.language)}
          </div>
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
              onClick={() => {
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
    [t, i18n.language, customerNames, stageLabel],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('crm.opportunities.title', { defaultValue: 'Opportunities' })}
        description={t('crm.opportunities.description', {
          defaultValue: 'Deals in progress, with their expected amount.',
        })}
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setDialogSession((session) => session + 1);
              setDialogOpen(true);
            }}
            disabled={customers.length === 0}
          >
            <PlusIcon data-icon='inline-start' />
            {t('crm.opportunities.create', { defaultValue: 'New opportunity' })}
          </Button>
        }
      />

      <div className='flex items-center gap-2'>
        <Select
          value={stageFilter}
          onValueChange={(value) => {
            setStatus('loading');
            setStageFilter(value as StageFilter);
          }}
        >
          <SelectTrigger
            className='w-48'
            aria-label={t('crm.fields.stage', { defaultValue: 'Stage' })}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>
              {t('crm.filters.allStages', { defaultValue: 'All stages' })}
            </SelectItem>
            {STAGE_ORDER.map((stage) => (
              <SelectItem key={stage} value={stage}>
                {stageLabel(stage)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
          data={opportunities as Opportunity[]}
          getRowId={(opportunity) => String(opportunity.id)}
          emptyMessage={t('crm.opportunities.empty', {
            defaultValue: 'No opportunities yet.',
          })}
          toolbar={(table) => (
            <>
              <DataTableViewOptions
                table={table}
                getColumnLabel={(column) =>
                  column.id === 'name'
                    ? t('crm.fields.name', { defaultValue: 'Name' })
                    : column.id === 'customer'
                      ? t('crm.fields.customer', { defaultValue: 'Customer' })
                      : column.id === 'stage'
                        ? t('crm.fields.stage', { defaultValue: 'Stage' })
                        : t('crm.fields.amount', { defaultValue: 'Amount' })
                }
              />
            </>
          )}
        />
      ) : null}

      <OpportunityDialog
        key={dialogSession}
        open={dialogOpen}
        opportunity={editing}
        customers={customers}
        onOpenChange={setDialogOpen}
        onSaved={() => {
          setStatus('loading');
          setListToken((token) => token + 1);
        }}
      />
    </PageContainer>
  );
}
