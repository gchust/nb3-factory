import { ApiClientError } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircleIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react';
import { type ReactElement, useMemo, useState } from 'react';
import { Link, Outlet, useNavigate, useParams } from 'react-router';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { RouteChildPage } from '@/components/route-child-page';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { SalesDeleteDialog } from '../../sales-delete-dialog';
import {
  SALES_STAGE_BADGE,
  formatAmount,
  salesErrorMessageKey,
  useApiQuery,
  type Contact,
  type CustomerDetail,
  type Opportunity,
} from '../../shared';

/**
 * Route `/sales/customers/:customerId`: the customer detail page.
 *
 * It is a covering child page rather than a drawer because it holds several sections at once: the customer's own
 * fields, its contacts, its opportunities and the estimated-amount total. Its `edit` dialog is a child route of
 * this one, so the dialog stacks on top of it.
 */
export default function CustomerDetailPage(): ReactElement {
  const { customerId = '' } = useParams();
  // Key by id so forward and back to another record start the page over rather than showing the previous record.
  return <CustomerDetailView key={customerId} customerId={customerId} />;
}

function CustomerDetailView({
  customerId,
}: {
  readonly customerId: string;
}): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const request = useMemo(
    () => ({ path: `sales/customers/${encodeURIComponent(customerId)}` }),
    [customerId],
  );
  const { data, error, loading } = useApiQuery<CustomerDetail>(request);

  const [deleting, setDeleting] = useState(false);

  const notFound = error instanceof ApiClientError && error.status === 404;
  const customer = notFound ? undefined : data;

  return (
    <>
      <RouteChildPage>
        <PageContainer>
          <Breadcrumbs />

          {notFound ? (
            <Alert variant='destructive'>
              <AlertCircleIcon />
              <AlertDescription>
                {t('sales.errors.customerNotFound')}
              </AlertDescription>
              <AlertAction>
                <Button
                  variant='outline'
                  size='sm'
                  nativeButton={false}
                  render={<Link to='..' />}
                >
                  {t('sales.actions.backToList')}
                </Button>
              </AlertAction>
            </Alert>
          ) : error && !loading ? (
            <Alert variant='destructive'>
              <AlertCircleIcon />
              <AlertDescription>
                {t(salesErrorMessageKey(error))}
              </AlertDescription>
            </Alert>
          ) : loading && !customer ? (
            <div className='space-y-4'>
              <Skeleton className='h-9 w-64' />
              <Skeleton className='h-28 w-full' />
              <Skeleton className='h-64 w-full' />
            </div>
          ) : customer ? (
            <>
              <PageHeader
                title={customer.name}
                description={
                  customer.industry ?? t('sales.customer.industryUnset')
                }
                actions={
                  <>
                    <Button
                      variant='outline'
                      nativeButton={false}
                      render={
                        <Link
                          to='edit'
                          relative='path'
                          aria-label={t('sales.customer.edit')}
                        />
                      }
                    >
                      <PencilIcon data-icon='inline-start' />
                      {t('sales.customer.edit')}
                    </Button>
                    <Button
                      variant='destructive'
                      onClick={() => setDeleting(true)}
                    >
                      <Trash2Icon data-icon='inline-start' />
                      {t('sales.customer.delete')}
                    </Button>
                  </>
                }
              />

              <CustomerSummary customer={customer} />

              <CustomerContactsCard contacts={customer.contacts} />

              <CustomerOpportunitiesCard
                opportunities={customer.opportunities}
                total={customer.opportunityAmountTotal}
              />
            </>
          ) : null}
        </PageContainer>
      </RouteChildPage>

      <SalesDeleteDialog
        open={deleting}
        onOpenChange={setDeleting}
        resource='customers'
        record={customer ?? null}
        onDeleted={() => {
          setDeleting(false);
          // The record this page shows is gone; return to the list that owns it.
          void navigate('..', { relative: 'path' });
        }}
      />

      {/* The edit dialog and the customer-scoped create dialogs stack here, beside the covering page. */}
      <Outlet />
    </>
  );
}

/** The three figures the customer page opens with: contacts, opportunities and the estimated-amount total. */
function CustomerSummary({
  customer,
}: {
  readonly customer: CustomerDetail;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  return (
    <div className='grid gap-4 sm:grid-cols-3'>
      <SummaryCard
        label={t('sales.customer.contactCount')}
        value={String(customer.contacts.length)}
      />
      <SummaryCard
        label={t('sales.customer.opportunityCount')}
        value={String(customer.opportunities.length)}
      />
      <SummaryCard
        label={t('sales.customer.opportunityAmountTotal')}
        value={formatAmount(locale, customer.opportunityAmountTotal)}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className='text-3xl font-semibold tabular-nums'>
        {value}
      </CardContent>
    </Card>
  );
}

function CustomerContactsCard({
  contacts,
}: {
  readonly contacts: readonly Contact[];
}): ReactElement {
  const { t } = useTranslation();
  const columns = useMemo<ColumnDef<Contact>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('sales.contact.name')}
          />
        ),
      },
      {
        accessorKey: 'phone',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('sales.contact.phone')}
          />
        ),
        cell: ({ row }) =>
          row.original.phone ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'email',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('sales.contact.email')}
          />
        ),
        cell: ({ row }) =>
          row.original.email ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
    ],
    [t],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('sales.customer.contacts')}</CardTitle>
        <CardAction>
          <Button
            variant='outline'
            size='sm'
            nativeButton={false}
            render={
              // The create route lives under this page; the owning customer is already known here.
              <Link to='contacts/new' relative='path' />
            }
          >
            <PlusIcon data-icon='inline-start' />
            {t('sales.contact.create')}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          data={[...contacts]}
          pageSize={5}
          pageSizeOptions={[5, 10, 20]}
          getRowId={(contact) => String(contact.id)}
          emptyMessage={t('sales.customer.noContacts')}
        />
      </CardContent>
    </Card>
  );
}

function CustomerOpportunitiesCard({
  opportunities,
  total,
}: {
  readonly opportunities: readonly Opportunity[];
  readonly total: number;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
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
          <span className='tabular-nums'>
            {formatAmount(locale, row.original.amount)}
          </span>
        ),
      },
    ],
    [locale, t],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('sales.customer.opportunities')}</CardTitle>
        <CardAction>
          <Button
            variant='outline'
            size='sm'
            nativeButton={false}
            render={<Link to='opportunities/new' relative='path' />}
          >
            <PlusIcon data-icon='inline-start' />
            {t('sales.opportunity.create')}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          data={[...opportunities]}
          pageSize={5}
          pageSizeOptions={[5, 10, 20]}
          getRowId={(opportunity) => String(opportunity.id)}
          emptyMessage={t('sales.customer.noOpportunities')}
        />
        {/* The requirement is the total of this customer's opportunities, computed by the endpoint. */}
        <p className='mt-4 text-right text-sm'>
          <span className='text-muted-foreground'>
            {t('sales.customer.opportunityAmountTotal')}
          </span>{' '}
          <span className='font-semibold tabular-nums'>
            {formatAmount(locale, total)}
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
