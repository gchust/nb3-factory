import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { SalesEditDialog } from '../form-dialog.js';
import type { Opportunity, SalesEditOutletContext } from '../types.js';
import { OpportunityForm } from './opportunity-form.js';

/**
 * Edit an opportunity. The list opens `/opportunities/edit/:opportunityId`; a customer's detail view opens the same
 * dialog one level deeper, so it stacks on the view the user is on and both totals refresh when the amount changes.
 */
export default function EditOpportunityPage(): ReactElement {
  const { opportunityId = '' } = useParams();
  // Remount when the parameter changes, so the dialog reloads instead of showing the previous record.
  return <EditOpportunity key={opportunityId} opportunityId={opportunityId} />;
}

function EditOpportunity({
  opportunityId,
}: {
  readonly opportunityId: string;
}): ReactElement {
  const { t } = useTranslation();
  // On the customer detail route the enclosing drawer provides these instead of the list; both keep their view fresh.
  const { onSaved, onNotFound } =
    useOutletContext<SalesEditOutletContext<Opportunity>>();
  return (
    <SalesEditDialog<Opportunity>
      title={t('sales.opportunity.edit')}
      description={t('sales.opportunity.formDescription')}
      path={`opportunities/${encodeURIComponent(opportunityId)}`}
      notFoundLabel={t('sales.opportunity.notFound')}
      skeletonFields={4}
      onSaved={onSaved}
      onNotFound={onNotFound}
      renderForm={(opportunity, props) => (
        <OpportunityForm {...props} opportunity={opportunity} />
      )}
    />
  );
}
