import { useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { PencilIcon } from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useOutletContext, useParams } from 'react-router';

import { DataTable } from '@/components/data-table';
import { RouteDrawer } from '@/components/route-drawer';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { formatAmount } from '../../format.js';
import { SalesErrorAlert } from '../../list-states.js';
import type {
  Contact,
  Customer,
  CustomerDetail,
  CustomersOutletContext,
  Opportunity,
  SalesEditOutletContext,
} from '../../types.js';
import { OpportunityStageBadge } from '../../opportunities/stage-badge.js';

/**
 * A customer's own page: who they are, who works with them, what they are worth, and every opportunity of theirs.
 *
 * It is a drawer over the customer list, and the opportunity edit dialog stacks on it, so the total and the tables
 * below refresh as soon as an amount changes.
 */
export default function CustomerDetailPage(): ReactElement {
  const { customerId = '' } = useParams();
  // Remount when the parameter changes, so the drawer reloads instead of showing the previous customer.
  return <CustomerDetail key={customerId} customerId={customerId} />;
}

function CustomerDetail({
  customerId,
}: {
  readonly customerId: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  // The list behind the drawer: a save or a deleted record refreshes both it and the drawer.
  const list = useOutletContext<CustomersOutletContext>();
  const [reloadCount, setReloadCount] = useState(0);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly detail?: CustomerDetail;
    readonly error?: unknown;
  }>();

  const requestKey = `${customerId}:${reloadCount}`;
  useEffect(() => {
    const controller = new AbortController();
    api
      .request<{ data: CustomerDetail }>({
        path: `customers/${encodeURIComponent(customerId)}`,
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) {
            setResult({ key: requestKey, detail: data });
          }
        },
        (error: unknown) => {
          if (!controller.signal.aborted) {
            setResult({ key: requestKey, error });
          }
        },
      );
    return () => controller.abort();
  }, [api, customerId, requestKey]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const detail = loading ? undefined : result?.detail;

  // The edit dialog stacked on this drawer reads these; keep them stable so its effect does not restart.
  const outletContext = useMemo<SalesEditOutletContext<Customer>>(() => {
    const refresh = () => {
      list.reload();
      setReloadCount((count) => count + 1);
    };
    return { onSaved: refresh, onNotFound: refresh };
  }, [list]);

  return (
    <RouteDrawer
      title={detail?.name ?? t('sales.customer.title')}
      description={t('sales.customer.detailDescription')}
      footer={<DetailFooter canEdit={Boolean(detail)} />}
    >
      {error ? (
        <SalesErrorAlert
          error={error}
          notFoundLabel={t('sales.customer.notFound')}
          onRetry={() => setReloadCount((count) => count + 1)}
        />
      ) : detail === undefined ? (
        <DetailSkeleton />
      ) : (
        <CustomerDetailBody detail={detail} />
      )}
      {/* The customer's own edit dialog renders here and stacks on this drawer. */}
      <Outlet context={outletContext} />
    </RouteDrawer>
  );
}

function CustomerDetailBody({
  detail,
}: {
  readonly detail: CustomerDetail;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();

  const contactColumns = useMemo<ColumnDef<Contact>[]>(
    () => [
      {
        accessorKey: 'name',
        enableHiding: false,
        header: t('sales.contact.name'),
        cell: ({ row }) => (
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
    ],
    [t],
  );

  const opportunityColumns = useMemo<ColumnDef<Opportunity>[]>(
    () => [
      {
        accessorKey: 'name',
        enableHiding: false,
        header: t('sales.opportunity.name'),
        cell: ({ row }) =>
          row.original.name ?? <span className='text-muted-foreground'>—</span>,
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
            {/* Relative to this drawer, so the dialog stacks on it and the total refreshes when the amount changes. */}
            <Button
              variant='ghost'
              size='icon-sm'
              aria-label={t('sales.opportunity.editNamed', {
                name: row.original.name ?? t('sales.opportunity.unnamed'),
              })}
              render={
                <Link
                  to={`opportunities/${encodeURIComponent(row.original.id)}/edit`}
                />
              }
            >
              <PencilIcon />
            </Button>
          </div>
        ),
      },
    ],
    [locale, t],
  );

  return (
    <div className='flex flex-col gap-8'>
      <dl className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
        <div className='flex flex-col gap-1'>
          <dt className='text-sm text-muted-foreground'>
            {t('sales.customer.industry')}
          </dt>
          <dd>{detail.industry ?? '—'}</dd>
        </div>
        <div className='flex flex-col gap-1'>
          <dt className='text-sm text-muted-foreground'>
            {t('sales.customer.opportunityTotal')}
          </dt>
          <dd className='font-heading text-2xl font-semibold tabular-nums'>
            {formatAmount(detail.opportunityTotal, locale)}
          </dd>
        </div>
      </dl>

      <section className='flex flex-col gap-3'>
        <h2 className='font-heading text-lg font-semibold'>
          {t('sales.customer.contacts')}
        </h2>
        {detail.contacts.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('sales.customer.noContacts')}
          </p>
        ) : (
          <DataTable
            columns={contactColumns}
            data={[...detail.contacts]}
            getRowId={(row) => row.id}
            pagination={false}
            showSelectedCount={false}
          />
        )}
      </section>

      <section className='flex flex-col gap-3'>
        <h2 className='font-heading text-lg font-semibold'>
          {t('sales.customer.opportunities')}
        </h2>
        {detail.opportunities.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('sales.customer.noOpportunities')}
          </p>
        ) : (
          <DataTable
            columns={opportunityColumns}
            data={[...detail.opportunities]}
            getRowId={(row) => row.id}
            pagination={false}
            showSelectedCount={false}
          />
        )}
      </section>
    </div>
  );
}

function DetailFooter({
  canEdit,
}: {
  readonly canEdit: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <>
      <Button type='button' variant='outline' onClick={() => void close()}>
        {t('actions.close')}
      </Button>
      {canEdit ? (
        <Button render={<Link to='edit' />} nativeButton={false}>
          <PencilIcon data-icon='inline-start' />
          {t('sales.customer.edit')}
        </Button>
      ) : null}
    </>
  );
}

function DetailSkeleton(): ReactElement {
  const { t } = useTranslation();
  return (
    <div
      role='status'
      aria-label={t('status.loading')}
      className='flex flex-col gap-8'
    >
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
        {['industry', 'total'].map((field) => (
          <div key={field} className='flex flex-col gap-2'>
            <Skeleton className='h-4 w-24' />
            <Skeleton className='h-8 w-40' />
          </div>
        ))}
      </div>
      {['contacts', 'opportunities'].map((section) => (
        <div key={section} className='flex flex-col gap-3'>
          <Skeleton className='h-5 w-32' />
          <Skeleton className='h-24 w-full rounded-lg' />
        </div>
      ))}
    </div>
  );
}
