import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useRef, useState } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

import { useCustomers } from '../hooks.js';
import type { CrmListOutletContext, Customer } from '../types.js';
import { OpportunityForm } from './opportunity-form.js';

const FORM_ID = 'opportunity-new-form';

/** Route `/opportunities/new`: the create dialog. */
export default function NewOpportunityPage(): ReactElement {
  const { t } = useTranslation();
  const { loading, data, error, reload } = useCustomers();
  // The state disables the buttons; the ref is what beforeClose reads.
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  let body: ReactElement;
  let footer: ReactElement;
  if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('crm.common.loadFailed')}</AlertDescription>
        <AlertAction>
          <Button variant='outline' size='sm' onClick={reload}>
            {t('status.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
    footer = <NewOpportunityFooter submitting={submitting} submitDisabled />;
  } else if (!data) {
    body = (
      <Skeleton
        className='h-64 w-full'
        role='status'
        aria-label={t('status.loading')}
        aria-busy={loading}
      />
    );
    footer = <NewOpportunityFooter submitting={submitting} submitDisabled />;
  } else {
    body = (
      <NewOpportunityBody
        customers={data}
        onSubmittingChange={handleSubmittingChange}
      />
    );
    footer = <NewOpportunityFooter submitting={submitting} />;
  }

  return (
    <RouteDialog
      title={t('crm.opportunities.newTitle')}
      description={t('crm.opportunities.form.description')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={footer}
    >
      {body}
    </RouteDialog>
  );
}

function NewOpportunityBody({
  customers,
  onSubmittingChange,
}: {
  readonly customers: Customer[];
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<CrmListOutletContext>();
  return (
    <OpportunityForm
      formId={FORM_ID}
      customers={customers}
      onSubmittingChange={onSubmittingChange}
      onSubmitted={() => {
        reload();
        void close();
      }}
    />
  );
}

function NewOpportunityFooter({
  submitting,
  submitDisabled = false,
}: {
  readonly submitting: boolean;
  readonly submitDisabled?: boolean;
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
      <Button
        type='submit'
        form={FORM_ID}
        disabled={submitting || submitDisabled}
      >
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('actions.saving') : t('actions.create')}
      </Button>
    </>
  );
}
