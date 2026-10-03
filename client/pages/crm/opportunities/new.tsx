import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useRef, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { OpportunityForm } from '../opportunity-form.js';
import type { OpportunitiesOutletContext } from '../types.js';

const FORM_ID = 'opportunity-new-form';

/** A positive integer query parameter, or undefined when it is absent or malformed. */
function toCustomerId(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/** The create dialog for an opportunity, optionally preselected to one customer. */
export default function NewOpportunityPage(): ReactElement {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const defaultCustomerId = toCustomerId(searchParams.get('customerId'));
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      title={t('crm.opportunities.create.title')}
      description={t('crm.opportunities.form.description')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={<NewOpportunityFooter submitting={submitting} />}
    >
      <NewOpportunityBody
        defaultCustomerId={defaultCustomerId}
        onSubmittingChange={handleSubmittingChange}
      />
    </RouteDialog>
  );
}

function NewOpportunityBody({
  defaultCustomerId,
  onSubmittingChange,
}: {
  readonly defaultCustomerId: number | undefined;
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<OpportunitiesOutletContext>();
  return (
    <OpportunityForm
      formId={FORM_ID}
      defaultCustomerId={defaultCustomerId}
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
}: {
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <div className='flex justify-end gap-2'>
      <Button
        variant='outline'
        disabled={submitting}
        onClick={() => void close()}
      >
        {t('actions.cancel')}
      </Button>
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? (
          <>
            <Spinner />
            {t('crm.action.saving')}
          </>
        ) : (
          t('crm.action.create')
        )}
      </Button>
    </div>
  );
}
