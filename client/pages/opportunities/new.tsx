import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useState } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

import type { SalesListOutletContext } from '../sales/types.js';
import { OpportunityForm } from './opportunity-form.js';

const FORM_ID = 'opportunity-create-form';

/** Route `/opportunities/new`: create an opportunity in a dialog over the list. */
export default function OpportunityCreatePage(): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<SalesListOutletContext>();
  const [submitting, setSubmitting] = useState(false);

  return (
    <RouteDialog
      title={t('sales.opportunities.form.createTitle')}
      description={t('sales.opportunities.form.createDescription')}
      footer={
        <>
          <Button
            variant='outline'
            onClick={() => void close()}
            disabled={submitting}
          >
            {t('actions.cancel')}
          </Button>
          <Button type='submit' form={FORM_ID} disabled={submitting}>
            {submitting ? <Spinner data-icon='inline-start' /> : null}
            {submitting ? t('actions.saving') : t('actions.save')}
          </Button>
        </>
      }
    >
      <OpportunityForm
        formId={FORM_ID}
        onSubmittingChange={setSubmitting}
        onSubmitted={() => {
          reload();
          void close();
        }}
      />
    </RouteDialog>
  );
}
