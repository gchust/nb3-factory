import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useOutletContext } from 'react-router';

import { SalesFormDialog } from '../form-dialog.js';
import type { OpportunitiesOutletContext } from '../types.js';
import { OpportunityForm } from './opportunity-form.js';

/** Create an opportunity. The list opens it and refreshes once it closes. */
export default function NewOpportunityPage(): ReactElement {
  const { t } = useTranslation();
  const { onSaved } = useOutletContext<OpportunitiesOutletContext>();
  return (
    <SalesFormDialog
      title={t('sales.opportunity.create')}
      description={t('sales.opportunity.formDescription')}
      submitLabel={t('actions.create')}
      onSaved={onSaved}
      renderForm={(props) => <OpportunityForm {...props} />}
    />
  );
}
