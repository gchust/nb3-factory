import { ApiClientError } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { PencilIcon, Trash2Icon } from 'lucide-react';
import { type ReactElement, type ReactNode, useMemo, useState } from 'react';
import { Link, Outlet, useParams } from 'react-router';

import { RouteDrawer } from '@/components/route-drawer';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import { SalesDeleteDialog } from '../../sales-delete-dialog';
import {
  SALES_STAGE_BADGE,
  formatAmount,
  formatDate,
  salesErrorMessageKey,
  useApiQuery,
  type Opportunity,
} from '../../shared';

/** Route `/sales/opportunities/:opportunityId`: the opportunity detail drawer. */
export default function OpportunityDetailPage(): ReactElement {
  const { opportunityId = '' } = useParams();
  // Key by id so forward and back to another record start the drawer over rather than showing the previous record.
  return (
    <OpportunityDetail key={opportunityId} opportunityId={opportunityId} />
  );
}

function OpportunityDetail({
  opportunityId,
}: {
  readonly opportunityId: string;
}): ReactElement {
  const { t } = useTranslation();
  const request = useMemo(
    () => ({
      path: `sales/opportunities/${encodeURIComponent(opportunityId)}`,
    }),
    [opportunityId],
  );
  const { data, error, loading } = useApiQuery<Opportunity>(request);
  const [deleting, setDeleting] = useState(false);
  const [gone, setGone] = useState(false);

  const notFound =
    gone || (error instanceof ApiClientError && error.status === 404);

  return (
    <>
      <RouteDrawer
        title={data?.name ?? t('sales.opportunity.detailTitle')}
        description={data?.customerName ?? undefined}
        footer={
          notFound ? undefined : (
            <OpportunityDetailFooter
              ready={data !== undefined}
              onDelete={() => setDeleting(true)}
            />
          )
        }
      >
        {notFound ? (
          <OpportunityMissing />
        ) : error && !loading ? (
          <p className='text-sm text-destructive' role='alert'>
            {t(salesErrorMessageKey(error))}
          </p>
        ) : loading || !data ? (
          <div className='space-y-4'>
            <Skeleton className='h-16 w-full' />
            <Skeleton className='h-16 w-full' />
            <Skeleton className='h-16 w-full' />
          </div>
        ) : (
          <OpportunityFields opportunity={data} />
        )}
        {/* The edit dialog stacks on the drawer, so its outlet belongs inside it. */}
        <Outlet />
      </RouteDrawer>

      <SalesDeleteDialog
        open={deleting}
        onOpenChange={setDeleting}
        resource='opportunities'
        record={data ?? null}
        onDeleted={() => {
          setDeleting(false);
          setGone(true);
        }}
      />
    </>
  );
}

function OpportunityFields({
  opportunity,
}: {
  readonly opportunity: Opportunity;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  return (
    <dl className='divide-y'>
      <DetailRow label={t('sales.opportunity.customer')}>
        {opportunity.customerName ?? '—'}
      </DetailRow>
      <DetailRow label={t('sales.opportunity.amount')}>
        <span className='tabular-nums'>
          {formatAmount(locale, opportunity.amount)}
        </span>
      </DetailRow>
      <DetailRow label={t('sales.opportunity.stage')}>
        <Badge variant={SALES_STAGE_BADGE[opportunity.stage]}>
          {t(`sales.stage.${opportunity.stage}`)}
        </Badge>
      </DetailRow>
      <DetailRow label={t('sales.opportunity.createdAt')}>
        {formatDate(locale, opportunity.createdAt)}
      </DetailRow>
      <DetailRow label={t('sales.opportunity.updatedAt')}>
        {formatDate(locale, opportunity.updatedAt)}
      </DetailRow>
    </dl>
  );
}

function DetailRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className='grid grid-cols-3 items-start gap-3 py-3 text-sm'>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className='col-span-2 break-words'>{children}</dd>
    </div>
  );
}

// useRouteOverlay() is only reachable inside the drawer, so the buttons are their own component.
function OpportunityDetailFooter({
  ready,
  onDelete,
}: {
  readonly ready: boolean;
  readonly onDelete: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const { close, isClosing } = useRouteOverlay();
  return (
    <>
      <Button
        type='button'
        variant='destructive'
        disabled={isClosing}
        onClick={onDelete}
      >
        <Trash2Icon data-icon='inline-start' />
        {t('sales.opportunity.delete')}
      </Button>
      <Button
        variant='outline'
        disabled={!ready || isClosing}
        nativeButton={false}
        render={<Link to='edit' relative='path' />}
      >
        <PencilIcon data-icon='inline-start' />
        {t('sales.opportunity.edit')}
      </Button>
      <Button type='button' disabled={isClosing} onClick={() => void close()}>
        {t('actions.close')}
      </Button>
    </>
  );
}

// The record is gone: the drawer says so and offers to leave, rather than a form over a missing row.
function OpportunityMissing(): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <div className='space-y-4'>
      <p className='text-sm text-destructive'>
        {t('sales.errors.opportunityNotFound')}
      </p>
      <Button variant='outline' onClick={() => void close()}>
        {t('sales.actions.backToList')}
      </Button>
    </div>
  );
}
