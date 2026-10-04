import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircleIcon,
  EllipsisIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from 'lucide-react';
import { type ReactElement, useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { DataTableViewOptions } from '@/components/data-table-view-options';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';

import { SalesDeleteDialog } from '../sales-delete-dialog';
import {
  OPPORTUNITY_STAGES,
  SALES_STAGE_BADGE,
  formatAmount,
  salesErrorMessageKey,
  sumAmounts,
  useApiQuery,
  useCustomerOptions,
  useUrlSearch,
  type NamedRecord,
  type Opportunity,
} from '../shared';

const ALL_STAGES = 'all';
const ALL_CUSTOMERS = 'all';

/** `/sales/opportunities`: the opportunity list, with a real server-side stage filter and a filtered total. */
export default function OpportunitiesPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useUrlSearch('search');
  const [stageFilter, setStageFilter] = useUrlSearch('stage');
  const [customerFilter, setCustomerFilter] = useUrlSearch('customerId');
  const { options: customerOptions } = useCustomerOptions();

  const request = useMemo(
    () => ({
      path: 'sales/opportunities',
      ...(search || stageFilter || customerFilter
        ? {
            query: {
              ...(search ? { search } : {}),
              ...(stageFilter ? { stage: stageFilter } : {}),
              ...(customerFilter ? { customerId: customerFilter } : {}),
            },
          }
        : {}),
    }),
    [customerFilter, search, stageFilter],
  );
  const { data, error, loading, reload } = useApiQuery<Opportunity[]>(request);
  const opportunities = data ?? [];

  const [deletion, setDeletion] = useState<{
    readonly open: boolean;
    readonly opportunity: NamedRecord | null;
  }>({ open: false, opportunity: null });

  const columns = useMemo<ColumnDef<Opportunity>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('sales.opportunity.name')}
          />
        ),
      },
      {
        accessorKey: 'customerName',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('sales.opportunity.customer')}
          />
        ),
        cell: ({ row }) =>
          row.original.customerName ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'stage',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('sales.opportunity.stage')}
          />
        ),
        cell: ({ row }) => (
          <Badge variant={SALES_STAGE_BADGE[row.original.stage]}>
            {t(`sales.stage.${row.original.stage}`)}
          </Badge>
        ),
      },
      {
        accessorKey: 'amount',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('sales.opportunity.amount')}
          />
        ),
        cell: ({ row }) => (
          <div className='text-right tabular-nums'>
            {formatAmount(locale, row.original.amount)}
          </div>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('sales.opportunity.createdAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='whitespace-nowrap'>
            {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
              new Date(row.original.createdAt),
            )}
          </span>
        ),
      },
      {
        id: 'actions',
        enableHiding: false,
        enableSorting: false,
        header: () => (
          <span className='sr-only'>{t('sales.table.actions')}</span>
        ),
        cell: ({ row }) => (
          <div
            className='flex justify-end'
            onClick={(event) => event.stopPropagation()}
          >
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant='ghost' size='icon-sm' />}
              >
                <EllipsisIcon />
                <span className='sr-only'>{t('sales.table.actions')}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuItem
                  render={
                    <Link
                      to={{
                        pathname: String(row.original.id),
                        search: location.search,
                      }}
                    />
                  }
                >
                  <PencilIcon />
                  {t('sales.opportunity.edit')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant='destructive'
                  onClick={() =>
                    setDeletion({ open: true, opportunity: row.original })
                  }
                >
                  <Trash2Icon />
                  {t('sales.opportunity.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [locale, location.search, t],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('sales.opportunities.title')}
        description={t('sales.opportunities.description')}
        actions={
          <Button
            nativeButton={false}
            render={<Link to={{ pathname: 'new', search: location.search }} />}
          >
            <PlusIcon data-icon='inline-start' />
            {t('sales.opportunity.create')}
          </Button>
        }
      />

      {error && opportunities.length === 0 ? (
        <Alert variant='destructive'>
          <AlertCircleIcon />
          <AlertDescription>{t(salesErrorMessageKey(error))}</AlertDescription>
          <AlertAction>
            <Button variant='outline' size='sm' onClick={reload}>
              {t('sales.actions.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={opportunities}
            pageSize={10}
            getRowId={(opportunity) => String(opportunity.id)}
            emptyMessage={t('sales.opportunities.empty')}
            onRowClick={(row) =>
              void navigate({
                pathname: String(row.original.id),
                search: location.search,
              })
            }
            toolbar={(table) => (
              <>
                <div className='relative max-w-xs flex-1'>
                  <SearchIcon className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
                  <Input
                    className='pl-8'
                    placeholder={t('sales.opportunities.searchPlaceholder')}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    aria-label={t('sales.opportunities.searchPlaceholder')}
                  />
                </div>
                {/* The stage filter is applied by the endpoint, so it also narrows the total below. */}
                <Select
                  value={stageFilter === '' ? ALL_STAGES : stageFilter}
                  onValueChange={(value) =>
                    setStageFilter(value === ALL_STAGES ? '' : (value ?? ''))
                  }
                >
                  <SelectTrigger
                    className='w-44'
                    aria-label={t('sales.opportunity.stage')}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_STAGES}>
                      {t('sales.opportunities.allStages')}
                    </SelectItem>
                    {OPPORTUNITY_STAGES.map((stage) => (
                      <SelectItem key={stage} value={stage}>
                        {t(`sales.stage.${stage}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={customerFilter === '' ? ALL_CUSTOMERS : customerFilter}
                  onValueChange={(value) =>
                    setCustomerFilter(
                      value === ALL_CUSTOMERS ? '' : (value ?? ''),
                    )
                  }
                >
                  <SelectTrigger
                    className='w-48'
                    aria-label={t('sales.opportunity.customer')}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_CUSTOMERS}>
                      {t('sales.opportunities.allCustomers')}
                    </SelectItem>
                    {customerOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {loading && data !== undefined ? (
                  <Spinner aria-label={t('sales.status.loading')} />
                ) : null}
                <DataTableViewOptions
                  table={table}
                  getColumnLabel={(column) =>
                    t(`sales.opportunity.columns.${column.id}`)
                  }
                />
              </>
            )}
          />
          <div className='flex items-baseline justify-end gap-2 text-sm'>
            <span className='text-muted-foreground'>
              {t('sales.opportunities.total')}
            </span>
            <span
              className='text-lg font-semibold tabular-nums'
              aria-live='polite'
            >
              {formatAmount(locale, sumAmounts(opportunities))}
            </span>
          </div>
        </>
      )}

      <SalesDeleteDialog
        open={deletion.open}
        onOpenChange={(open) =>
          setDeletion((current) => ({ ...current, open }))
        }
        resource='opportunities'
        record={deletion.opportunity}
        onDeleted={() =>
          setDeletion((current) => ({ ...current, open: false }))
        }
      />

      <Outlet />
    </PageContainer>
  );
}
