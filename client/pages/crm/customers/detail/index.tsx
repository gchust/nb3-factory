import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import {
  AlertCircleIcon,
  BuildingIcon,
  CircleDollarSignIcon,
  PencilIcon,
  TargetIcon,
  UsersIcon,
} from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import {
  Link,
  Outlet,
  useLocation,
  useOutletContext,
  useParams,
} from 'react-router';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { RouteChildPage } from '@/components/route-child-page';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { fetchCustomerDetail } from '../../api.js';
import { formatAmount, formatDate, orDash } from '../../format.js';
import { StageBadge } from '../../stage-badge.js';
import type {
  Customer,
  CustomerDetail,
  CustomerDetailOutletContext,
  CustomersOutletContext,
} from '../../types.js';

export default function CustomerDetailPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const params = useParams();
  const customerId = params.customerId ?? '';
  const { reload: reloadList } = useOutletContext<CustomersOutletContext>();

  const [missing, setMissing] = useState(false);
  const [reloadCount, retry] = useReducer((count: number) => count + 1, 0);
  const requestKey = JSON.stringify([customerId, reloadCount]);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly detail?: CustomerDetail;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    if (missing) return;
    const controller = new AbortController();
    const key = JSON.stringify([customerId, reloadCount]);
    fetchCustomerDetail(api, customerId, controller.signal).then(
      (detail) => {
        if (!controller.signal.aborted) setResult({ key, detail });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiClientError && error.status === 404) {
          setMissing(true);
          setResult({ key });
          return;
        }
        setResult((previous) => ({ ...previous, key, error }));
      },
    );
    return () => controller.abort();
  }, [api, customerId, reloadCount, missing]);

  const loading = !missing && result?.key !== requestKey;
  const error = loading || missing ? undefined : result?.error;
  const detail = missing ? undefined : result?.detail;

  const outletContext = useMemo<CustomerDetailOutletContext>(
    () => ({
      onSaved: (customer: Customer) => {
        // Update the detail view immediately with the record the endpoint returned (guideline R2).
        setResult((previous) =>
          previous?.detail
            ? { ...previous, detail: { ...previous.detail, ...customer } }
            : previous,
        );
        reloadList();
      },
      onNotFound: () => {
        setMissing(true);
        reloadList();
      },
    }),
    [reloadList],
  );

  return (
    <>
      <RouteChildPage>
        <PageContainer>
          <Breadcrumbs />
          {missing ? (
            <Alert>
              <AlertCircleIcon />
              <AlertTitle>{t('crm.record.notFound.title')}</AlertTitle>
              <AlertDescription>
                {t('crm.record.notFound.description')}
              </AlertDescription>
            </Alert>
          ) : error ? (
            <Alert variant='destructive'>
              <AlertCircleIcon />
              <AlertTitle>{t('crm.error.title')}</AlertTitle>
              <AlertDescription>
                {t('crm.error.requestFailed')}
              </AlertDescription>
              <AlertAction>
                <Button variant='outline' size='sm' onClick={retry}>
                  {t('status.retry')}
                </Button>
              </AlertAction>
            </Alert>
          ) : loading || !detail ? (
            <DetailSkeleton label={t('status.loading')} />
          ) : (
            <CustomerDetailContent detail={detail} locale={locale} />
          )}
        </PageContainer>
      </RouteChildPage>
      {/* The edit dialog's outlet sits beside RouteChildPage, not inside its scroll container. */}
      <Outlet context={outletContext} />
    </>
  );
}

function CustomerDetailContent({
  detail,
  locale,
}: {
  readonly detail: CustomerDetail;
  readonly locale: string;
}): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();

  return (
    <>
      <PageHeader
        title={detail.name}
        description={
          <span className='inline-flex items-center gap-2'>
            <BuildingIcon className='size-4' />
            {orDash(detail.industry)}
          </span>
        }
        actions={
          <Button
            render={<Link to={{ pathname: 'edit', search: location.search }} />}
            nativeButton={false}
          >
            <PencilIcon data-icon='inline-start' />
            {t('crm.actions.edit')}
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('crm.customer.detail.info')}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className='grid gap-4 sm:grid-cols-2'>
            <div className='space-y-1'>
              <dt className='text-sm text-muted-foreground'>
                {t('crm.customer.fields.industry')}
              </dt>
              <dd className='text-sm'>{orDash(detail.industry)}</dd>
            </div>
            <div className='space-y-1'>
              <dt className='text-sm text-muted-foreground'>
                {t('crm.customer.fields.updatedAt')}
              </dt>
              <dd className='text-sm'>
                {formatDate(locale, detail.updatedAt)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <div className='grid gap-4 sm:grid-cols-3'>
        <Card>
          <CardHeader>
            <CardDescription className='flex items-center gap-2'>
              <CircleDollarSignIcon className='size-4' />
              {t('crm.customer.detail.totalAmount')}
            </CardDescription>
            <CardTitle className='font-heading text-2xl tabular-nums'>
              {formatAmount(locale, detail.opportunityAmountTotal)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription className='flex items-center gap-2'>
              <UsersIcon className='size-4' />
              {t('crm.customer.detail.contacts')}
            </CardDescription>
            <CardTitle className='font-heading text-2xl tabular-nums'>
              {detail.contacts.length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription className='flex items-center gap-2'>
              <TargetIcon className='size-4' />
              {t('crm.customer.detail.opportunities')}
            </CardDescription>
            <CardTitle className='font-heading text-2xl tabular-nums'>
              {detail.opportunities.length}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('crm.customer.detail.contacts')}</CardTitle>
        </CardHeader>
        <CardContent>
          {detail.contacts.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('crm.customer.detail.noContacts')}
            </p>
          ) : (
            <div className='overflow-hidden rounded-lg border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('crm.contact.fields.name')}</TableHead>
                    <TableHead>{t('crm.contact.fields.phone')}</TableHead>
                    <TableHead>{t('crm.contact.fields.email')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.contacts.map((contact) => (
                    <TableRow key={contact.id}>
                      <TableCell className='font-medium'>
                        {contact.name}
                      </TableCell>
                      <TableCell className='text-muted-foreground'>
                        {orDash(contact.phone)}
                      </TableCell>
                      <TableCell className='text-muted-foreground'>
                        {orDash(contact.email)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('crm.customer.detail.opportunities')}</CardTitle>
        </CardHeader>
        <CardContent>
          {detail.opportunities.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('crm.customer.detail.noOpportunities')}
            </p>
          ) : (
            <div className='overflow-hidden rounded-lg border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('crm.opportunity.fields.name')}</TableHead>
                    <TableHead>{t('crm.opportunity.fields.stage')}</TableHead>
                    <TableHead className='text-right'>
                      {t('crm.opportunity.fields.amount')}
                    </TableHead>
                    <TableHead>
                      {t('crm.opportunity.fields.updatedAt')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.opportunities.map((opportunity) => (
                    <TableRow key={opportunity.id}>
                      <TableCell className='font-medium'>
                        {opportunity.name}
                      </TableCell>
                      <TableCell>
                        <StageBadge stage={opportunity.stage} />
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>
                        {formatAmount(locale, opportunity.amount)}
                      </TableCell>
                      <TableCell className='whitespace-nowrap text-muted-foreground'>
                        {formatDate(locale, opportunity.updatedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function DetailSkeleton({ label }: { readonly label: string }): ReactElement {
  return (
    <div role='status' aria-label={label} className='space-y-6'>
      <Skeleton className='h-9 w-64' />
      <div className='grid gap-4 sm:grid-cols-3'>
        <Skeleton className='h-28' />
        <Skeleton className='h-28' />
        <Skeleton className='h-28' />
      </div>
      <Skeleton className='h-48' />
    </div>
  );
}
