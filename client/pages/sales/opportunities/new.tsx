import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useState } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';

import { CloseOnSubmit } from '../close-on-submit.js';
import { FormDialogFooter } from '../form-dialog-footer.js';
import { OpportunityForm } from '../opportunity-form.js';
import type { OpportunitiesOutletContext } from '../types.js';

const FORM_ID = 'opportunity-create';

export default function NewOpportunityDialog(): ReactElement {
  const { t } = useTranslation();
  const { reload } = useOutletContext<OpportunitiesOutletContext>();
  const [submitting, setSubmitting] = useState(false);

  return (
    <RouteDialog
      title={t('sales.opportunities.new.title')}
      description={t('sales.opportunities.new.description')}
      footer={<FormDialogFooter formId={FORM_ID} submitting={submitting} />}
    >
      <CloseOnSubmit onSaved={reload}>
        {(onSubmitted) => (
          <OpportunityForm
            formId={FORM_ID}
            onSubmittingChange={setSubmitting}
            onSubmitted={onSubmitted}
          />
        )}
      </CloseOnSubmit>
    </RouteDialog>
  );
}
