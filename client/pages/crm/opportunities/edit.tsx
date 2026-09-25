import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useRef, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { CrmTableSkeleton } from '../table-skeleton.js';
import type { OpportunitiesOutletContext, Opportunity } from '../types.js';
import { OpportunityForm } from './opportunity-form.js';

const FORM_ID = 'opportunity-edit-form';

export default function EditOpportunityPage(): ReactElement {
  const { t } = useTranslation();
  const { opportunityId } = useParams<{ opportunityId: string }>();
  const { rows, reload } = useOutletContext<OpportunitiesOutletContext>();

  const [submitting, setSubmitting] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  const opportunity = rows?.find((row) => String(row.id) === opportunityId);

  if (notFound || (rows !== undefined && !opportunity)) {
    return (
      <RouteDialog
        title={t('crm.error.notFoundTitle')}
        className='sm:max-w-lg'
        footer={<CloseOnlyFooter />}
      >
        <Alert variant='destructive'>
          <AlertCircleIcon />
          <AlertDescription>
            {t('crm.error.notFoundDescription')}
          </AlertDescription>
        </Alert>
      </RouteDialog>
    );
  }

  if (!opportunity) {
    return (
      <RouteDialog
        title={t('crm.opportunities.edit.title')}
        className='sm:max-w-lg'
        footer={<CloseOnlyFooter />}
      >
        <CrmTableSkeleton label={t('status.loading')} />
      </RouteDialog>
    );
  }

  return (
    <RouteDialog
      title={t('crm.opportunities.edit.title')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={<EditOpportunityFooter submitting={submitting} />}
    >
      <EditOpportunityBody
        opportunity={opportunity}
        onSubmittingChange={handleSubmittingChange}
        onNotFound={() => {
          setNotFound(true);
          reload();
        }}
      />
    </RouteDialog>
  );
}

function EditOpportunityBody({
  opportunity,
  onSubmittingChange,
  onNotFound,
}: {
  readonly opportunity: Opportunity;
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onNotFound: () => void;
}): ReactElement {
  const { reload } = useOutletContext<OpportunitiesOutletContext>();
  const { close } = useRouteOverlay();
  return (
    <OpportunityForm
      opportunity={opportunity}
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onNotFound={onNotFound}
      onSubmitted={() => {
        reload();
        void close();
      }}
    />
  );
}

function EditOpportunityFooter({
  submitting,
}: {
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <>
      <Button
        variant='outline'
        disabled={submitting}
        onClick={() => void close()}
      >
        {t('actions.cancel')}
      </Button>
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('crm.actions.saving') : t('crm.actions.save')}
      </Button>
    </>
  );
}

function CloseOnlyFooter(): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <Button variant='outline' onClick={() => void close()}>
      {t('actions.close')}
    </Button>
  );
}
