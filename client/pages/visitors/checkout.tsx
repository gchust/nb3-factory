import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { VisitorStatusBadge } from './status-badge.js';
import type { Visitor, VisitorsOutletContext } from './types.js';
import { VisitorCheckoutForm } from './visitor-checkout-form.js';

const FORM_ID = 'visitor-checkout-form';

/** Route `/visitors/:visitorId/checkout`: records a departure in a dialog over the register. */
export default function CheckoutVisitorPage(): ReactElement {
  const { visitorId = '' } = useParams();
  // Remounting per id keeps the fetched record and the form in step with the URL.
  return <CheckoutVisitor key={visitorId} visitorId={visitorId} />;
}

interface FetchState {
  readonly status: 'loading' | 'loaded' | 'failed';
  readonly visitor?: Visitor;
  readonly error?: unknown;
}

function CheckoutVisitor({
  visitorId,
}: {
  readonly visitorId: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();

  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  // The page is keyed by visitor id, so this starts loading for each id.
  const [state, setState] = useState<FetchState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    void api
      .request<{ data: Visitor }>({
        path: `visitors/${encodeURIComponent(visitorId)}`,
        method: 'GET',
        signal: controller.signal,
      })
      .then((response) =>
        setState({ status: 'loaded', visitor: response.data }),
      )
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setState({ status: 'failed', error });
      });
    return () => controller.abort();
  }, [api, visitorId]);

  const loading = state.status === 'loading';
  const visitor = state.status === 'loaded' ? state.visitor : undefined;
  const error = state.status === 'failed' ? state.error : undefined;
  const status = error instanceof ApiClientError ? error.status : undefined;

  let body: ReactElement;
  if (loading) {
    body = (
      <div className='space-y-3'>
        <Skeleton className='h-5 w-40' />
        <Skeleton className='h-24 w-full' />
      </div>
    );
  } else if (status === 404) {
    body = (
      <Alert variant='destructive'>
        <AlertDescription>{t('visitors.error.notFound')}</AlertDescription>
      </Alert>
    );
  } else if (status === 403) {
    body = (
      <Alert variant='destructive'>
        <AlertDescription>{t('visitors.error.forbidden')}</AlertDescription>
      </Alert>
    );
  } else if (error || !visitor) {
    body = (
      <Alert variant='destructive'>
        <AlertDescription>{t('visitors.error.requestFailed')}</AlertDescription>
      </Alert>
    );
  } else {
    body = (
      <div className='space-y-5'>
        <VisitorSummary visitor={visitor} />
        <CheckoutBody
          visitor={visitor}
          onSubmittingChange={handleSubmittingChange}
        />
      </div>
    );
  }

  return (
    <RouteDialog
      title={t('visitors.checkout.title')}
      description={
        visitor
          ? t('visitors.checkout.description', { name: visitor.name })
          : undefined
      }
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={
        visitor ? (
          <CheckoutFooter submitting={submitting} />
        ) : (
          <CheckoutCloseFooter />
        )
      }
    >
      {body}
    </RouteDialog>
  );
}

function VisitorSummary({
  visitor,
}: {
  readonly visitor: Visitor;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const format = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );

  return (
    <dl className='bg-muted/40 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border border-border p-4 text-sm'>
      <dt className='text-muted-foreground'>{t('visitors.fields.name')}</dt>
      <dd className='flex items-center gap-2 font-medium'>
        {visitor.name}
        <VisitorStatusBadge visitor={visitor} />
      </dd>
      <dt className='text-muted-foreground'>{t('visitors.fields.phone')}</dt>
      <dd>{visitor.phone}</dd>
      <dt className='text-muted-foreground'>
        {t('visitors.fields.employeeName')}
      </dt>
      <dd>{visitor.employeeName}</dd>
      <dt className='text-muted-foreground'>
        {t('visitors.fields.arrivedAt')}
      </dt>
      <dd>{format.format(new Date(visitor.arrivedAt))}</dd>
    </dl>
  );
}

// useRouteOverlay() only works inside the RouteDialog, so the form and the
// footer buttons each get their own wrapper component.
function CheckoutBody({
  visitor,
  onSubmittingChange,
}: {
  readonly visitor: Visitor;
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<VisitorsOutletContext>();
  return (
    <VisitorCheckoutForm
      visitor={visitor}
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onSubmitted={() => {
        reload();
        void close();
      }}
      onNotFound={() => reload()}
      onStale={() => reload()}
    />
  );
}

function CheckoutFooter({
  submitting,
}: {
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <>
      <Button
        type='button'
        variant='outline'
        disabled={submitting}
        onClick={() => void close()}
      >
        {t('actions.cancel')}
      </Button>
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('actions.saving') : t('visitors.checkout.submit')}
      </Button>
    </>
  );
}

function CheckoutCloseFooter(): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <Button type='button' variant='outline' onClick={() => void close()}>
      {t('actions.close')}
    </Button>
  );
}
