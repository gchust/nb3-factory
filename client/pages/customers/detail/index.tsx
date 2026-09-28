import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { BuildingIcon, MailIcon, PhoneIcon } from 'lucide-react';
import { type ReactElement, useMemo } from 'react';
import {
  Link,
  Outlet,
  useLocation,
  useOutletContext,
  useParams,
} from 'react-router';

import { RouteDrawer } from '@/components/route-drawer';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { getCustomer } from '../../crm/api.js';
import { formatAmount, stageKey } from '../../crm/format.js';
import { CrmError } from '../../crm/request-state.js';
import {
  type Contact,
  type CustomerDetail,
  type CustomerDetailOutletContext,
  type CustomersOutletContext,
  type Opportunity,
} from '../../crm/types.js';
import { useApiData } from '../../crm/use-api-data.js';

const STAGE_VARIANT = {
  following: 'secondary',
  won: 'default',
  lost: 'outline',
} as const;

export default function CustomerDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { customerId } = useParams();
  const id = Number(customerId);
  const valid = Number.isInteger(id) && id > 0;
  const { reload: reloadList } = useOutletContext<CustomersOutletContext>();

  const {
    data,
    error,
    loading,
    reload: reloadDetail,
  } = useApiData(
    valid ? `crm:customer:${id}` : 'crm:customer:invalid',
    (signal) =>
      valid
        ? getCustomer(api, id, signal)
        : Promise.reject(new Error('Invalid customer id')),
  );

  // The edit dialog receives these through `<Outlet context>`.
  const detailContext = useMemo<CustomerDetailOutletContext>(
    () => ({ reloadDetail, reloadList }),
    [reloadDetail, reloadList],
  );

  let body: ReactElement;
  if (!valid) {
    body = <NotFound />;
  } else if (loading && !data) {
    body = (
      <div className='space-y-4' role='status' aria-hidden='true'>
        <Skeleton className='h-6 w-1/3' />
        <Skeleton className='h-24 w-full' />
        <Skeleton className='h-40 w-full' />
      </div>
    );
  } else if (error && !data) {
    body = (
      <CrmError
        error={error}
        onRetry={reloadDetail}
        notFoundMessage={t('crm.customer.detail.notFound')}
      />
    );
  } else if (data) {
    body = <CustomerDetailBody customer={data} />;
  } else {
    body = <NotFound />;
  }

  return (
    <RouteDrawer
      title={data?.name ?? t('crm.customer.detail.title')}
      description={t('crm.customer.detail.description')}
      className='sm:max-w-2xl'
      footer={<CustomerDetailFooter />}
    >
      <div className='space-y-6'>
        {body}
        {/* The edit dialog stacks on this drawer. */}
        <Outlet context={detailContext} />
      </div>
    </RouteDrawer>
  );
}

function NotFound(): ReactElement {
  const { t } = useTranslation();
  return (
    <Alert variant='destructive'>
      <AlertDescription>{t('crm.customer.detail.notFound')}</AlertDescription>
    </Alert>
  );
}

function CustomerDetailBody({
  customer,
}: {
  readonly customer: CustomerDetail;
}): ReactElement {
  const { t, i18n } = useTranslation();

  return (
    <>
      <div className='grid gap-3 sm:grid-cols-3'>
        <SummaryCard
          label={t('crm.customer.fields.contacts')}
          value={String(customer.contactCount)}
        />
        <SummaryCard
          label={t('crm.customer.fields.opportunities')}
          value={String(customer.opportunityCount)}
        />
        <SummaryCard
          label={t('crm.customer.fields.opportunityTotal')}
          value={formatAmount(customer.opportunityTotal, i18n.language)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('crm.customer.detail.profile')}</CardTitle>
        </CardHeader>
        <CardContent className='flex items-center gap-2 text-sm'>
          <BuildingIcon className='size-4 text-muted-foreground' />
          <span className='text-muted-foreground'>
            {t('crm.customer.fields.industry')}
          </span>
          <span className='font-medium'>
            {customer.industry ?? (
              <span className='text-muted-foreground'>—</span>
            )}
          </span>
        </CardContent>
      </Card>

      <section className='space-y-3'>
        <h3 className='text-sm font-medium'>
          {t('crm.customer.detail.contacts')}
        </h3>
        {customer.contacts.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('crm.contact.emptyForCustomer')}
          </p>
        ) : (
          <ul className='space-y-2'>
            {customer.contacts.map((contact) => (
              <li key={contact.id}>
                <ContactRow contact={contact} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <Separator />

      <section className='space-y-3'>
        <h3 className='text-sm font-medium'>
          {t('crm.customer.detail.opportunities')}
        </h3>
        {customer.opportunities.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('crm.opportunity.emptyForCustomer')}
          </p>
        ) : (
          <ul className='space-y-2'>
            {customer.opportunities.map((opportunity) => (
              <li key={opportunity.id}>
                <OpportunityRow
                  opportunity={opportunity}
                  language={i18n.language}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
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
        <CardTitle className='text-xl tabular-nums'>{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function ContactRow({ contact }: { readonly contact: Contact }): ReactElement {
  return (
    <div className='rounded-lg border p-3'>
      <p className='font-medium'>{contact.name}</p>
      <div className='mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground'>
        {contact.phone ? (
          <span className='inline-flex items-center gap-1'>
            <PhoneIcon className='size-3.5' />
            {contact.phone}
          </span>
        ) : null}
        {contact.email ? (
          <span className='inline-flex items-center gap-1'>
            <MailIcon className='size-3.5' />
            {contact.email}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function OpportunityRow({
  opportunity,
  language,
}: {
  readonly opportunity: Opportunity;
  readonly language: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='flex items-center justify-between gap-4 rounded-lg border p-3'>
      <div className='min-w-0'>
        <p className='truncate font-medium'>{opportunity.name}</p>
        <Badge variant={STAGE_VARIANT[opportunity.stage]}>
          {t(stageKey(opportunity.stage))}
        </Badge>
      </div>
      <span className='shrink-0 font-medium tabular-nums'>
        {formatAmount(opportunity.amount, language)}
      </span>
    </div>
  );
}

function CustomerDetailFooter(): ReactElement {
  const { t } = useTranslation();
  const { close, isClosing } = useRouteOverlay();
  const location = useLocation();
  return (
    <>
      <Link
        className={buttonVariants({ variant: 'outline' })}
        to={{ pathname: 'edit', search: location.search }}
      >
        {t('actions.edit')}
      </Link>
      <Button type='button' disabled={isClosing} onClick={() => void close()}>
        {t('actions.close')}
      </Button>
    </>
  );
}
