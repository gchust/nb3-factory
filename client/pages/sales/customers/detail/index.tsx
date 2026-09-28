import { useTranslation } from '@nocobase/i18n/client';
import { PencilIcon } from 'lucide-react';
import { type ReactElement, useMemo } from 'react';
import {
  Link,
  Outlet,
  useLocation,
  useOutletContext,
  useParams,
} from 'react-router';

import { Loading } from '@/components/loading';
import { RouteDrawer } from '@/components/route-drawer';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

import { DrawerCloseButton } from '../../drawer-close-button.js';
import { formatAmount, formatDate } from '../../format.js';
import { RemoteDataError } from '../../remote-data.js';
import { STAGE_BADGE_VARIANT, stageLabelKey } from '../../stage.js';
import type { CustomerDetail, CustomersOutletContext } from '../../types.js';
import { useRemoteOne } from '../../use-remote.js';

export default function CustomerDetailDrawer(): ReactElement {
  const { t } = useTranslation();
  const { search } = useLocation();
  const params = useParams<{ customerId: string }>();
  const parsedId = Number(params.customerId);
  const id = Number.isInteger(parsedId) && parsedId > 0 ? parsedId : undefined;
  const { data, loading, error, notFound, reload } =
    useRemoteOne<CustomerDetail>('customers', id);

  const { reload: reloadList } = useOutletContext<CustomersOutletContext>();
  // The edit dialog stacks on this drawer, so the drawer owns the outlet and
  // refreshes both itself and the list behind it when the dialog saves.
  const outletContext = useMemo<CustomersOutletContext>(
    () => ({
      reload: () => {
        reloadList();
        reload();
      },
    }),
    [reloadList, reload],
  );

  return (
    <RouteDrawer
      className='sm:max-w-2xl'
      title={data?.name ?? t('sales.customers.detail.title')}
      footer={loading || error || notFound ? <DrawerCloseButton /> : undefined}
    >
      {loading ? <Loading /> : null}
      {error ? <RemoteDataError reload={reload} /> : null}
      {notFound ? (
        <p className='text-sm text-muted-foreground'>
          {t('sales.customers.detail.notFound')}
        </p>
      ) : null}
      {data ? (
        <div className='space-y-6'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div className='min-w-0'>
              <p className='text-sm text-muted-foreground'>
                {t('sales.fields.industry')}
              </p>
              <p className='font-medium'>{data.industry ?? '—'}</p>
            </div>
            <Link
              className={cn(
                buttonVariants({ variant: 'outline', size: 'sm' }),
                'gap-1.5',
              )}
              to={{ pathname: 'edit', search }}
            >
              <PencilIcon />
              {t('actions.edit')}
            </Link>
          </div>

          <div className='grid gap-4 sm:grid-cols-3'>
            <Card>
              <CardHeader>
                <CardDescription>
                  {t('sales.customers.detail.contactsCount')}
                </CardDescription>
                <CardTitle className='text-2xl'>
                  {data.contacts.length}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>
                  {t('sales.customers.detail.opportunitiesCount')}
                </CardDescription>
                <CardTitle className='text-2xl'>
                  {data.opportunities.length}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>
                  {t('sales.customers.detail.totalAmount')}
                </CardDescription>
                <CardTitle className='text-2xl'>
                  {formatAmount(data.totalOpportunityAmount)}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <section className='space-y-3'>
            <h2 className='text-base font-semibold'>
              {t('sales.customers.detail.contacts')}
            </h2>
            <div className='overflow-hidden rounded-lg border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('sales.fields.name')}</TableHead>
                    <TableHead>{t('sales.fields.phone')}</TableHead>
                    <TableHead>{t('sales.fields.email')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.contacts.length === 0 ? (
                    <TableRow>
                      <TableCell className='text-muted-foreground' colSpan={3}>
                        {t('sales.customers.detail.noContacts')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.contacts.map((contact) => (
                      <TableRow key={contact.id}>
                        <TableCell>{contact.name}</TableCell>
                        <TableCell>{contact.phone ?? '—'}</TableCell>
                        <TableCell>{contact.email ?? '—'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          <section className='space-y-3'>
            <h2 className='text-base font-semibold'>
              {t('sales.customers.detail.opportunities')}
            </h2>
            <div className='overflow-hidden rounded-lg border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('sales.fields.name')}</TableHead>
                    <TableHead className='text-right'>
                      {t('sales.fields.amount')}
                    </TableHead>
                    <TableHead>{t('sales.fields.stage')}</TableHead>
                    <TableHead>{t('sales.fields.updatedAt')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.opportunities.length === 0 ? (
                    <TableRow>
                      <TableCell className='text-muted-foreground' colSpan={4}>
                        {t('sales.customers.detail.noOpportunities')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.opportunities.map((opportunity) => (
                      <TableRow key={opportunity.id}>
                        <TableCell>{opportunity.name}</TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {formatAmount(opportunity.amount)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={STAGE_BADGE_VARIANT[opportunity.stage]}
                          >
                            {t(stageLabelKey(opportunity.stage))}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {formatDate(opportunity.updatedAt)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          <Outlet context={outletContext} />
        </div>
      ) : null}
    </RouteDrawer>
  );
}
