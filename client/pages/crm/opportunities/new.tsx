import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useState } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import type { OpportunityListOutletContext } from '../types.js';
import { OpportunityForm } from './opportunity-form.js';

const FORM_ID = 'opportunity-create-form';

/** Create an opportunity, opened at `/opportunities/new` over the list. */
export default function NewOpportunityPage(): ReactElement {
  const { t } = useTranslation();
  const { reload } = useOutletContext<OpportunityListOutletContext>();
  const [submitting, setSubmitting] = useState(false);

  return (
    <RouteDialog
      title={t('opportunities.create.title')}
      description={t('opportunities.form.description')}
      className='sm:max-w-lg'
      beforeClose={() => !submitting}
      footer={<NewOpportunityFooter submitting={submitting} />}
    >
      <NewOpportunityBody
        onSubmittingChange={setSubmitting}
        onSubmitted={() => {
          reload();
        }}
      />
    </RouteDialog>
  );
}

function NewOpportunityBody({
  onSubmittingChange,
  onSubmitted,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onSubmitted: () => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  return (
    <OpportunityForm
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onSubmitted={() => {
        onSubmitted();
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
  const { close, isClosing } = useRouteOverlay();
  return (
    <>
      <Button
        type='button'
        variant='outline'
        disabled={submitting || isClosing}
        onClick={() => void close()}
      >
        {t('actions.cancel')}
      </Button>
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('actions.saving') : t('actions.create')}
      </Button>
    </>
  );
}
