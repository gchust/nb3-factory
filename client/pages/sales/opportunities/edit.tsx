import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { Loading } from '@/components/loading';
import { RouteDialog } from '@/components/route-dialog';

import { CloseOnSubmit } from '../close-on-submit.js';
import { DrawerCloseButton } from '../drawer-close-button.js';
import { FormDialogFooter } from '../form-dialog-footer.js';
import { OpportunityForm } from '../opportunity-form.js';
import { RemoteDataError } from '../remote-data.js';
import type { Opportunity, OpportunitiesOutletContext } from '../types.js';
import { useRemoteOne } from '../use-remote.js';

const FORM_ID = 'opportunity-edit';

export default function EditOpportunityDialog(): ReactElement {
  const { t } = useTranslation();
  const { opportunityId } = useParams<{ opportunityId: string }>();
  const parsedId = Number(opportunityId);
  const id = Number.isInteger(parsedId) && parsedId > 0 ? parsedId : undefined;
  const { data, loading, error, notFound, reload } = useRemoteOne<Opportunity>(
    'opportunities',
    id,
  );
  const { reload: reloadParent } =
    useOutletContext<OpportunitiesOutletContext>();
  const [submitting, setSubmitting] = useState(false);

  return (
    <RouteDialog
      title={t('sales.opportunities.edit.title')}
      description={t('sales.opportunities.edit.description')}
      footer={
        data ? (
          <FormDialogFooter formId={FORM_ID} submitting={submitting} />
        ) : (
          <DrawerCloseButton />
        )
      }
    >
      {loading ? <Loading /> : null}
      {error ? <RemoteDataError reload={reload} /> : null}
      {notFound ? (
        <p className='text-sm text-muted-foreground'>
          {t('sales.opportunities.detail.notFound')}
        </p>
      ) : null}
      {data ? (
        <CloseOnSubmit onSaved={reloadParent}>
          {(onSubmitted) => (
            <OpportunityForm
              opportunity={data}
              formId={FORM_ID}
              onSubmittingChange={setSubmitting}
              onSubmitted={onSubmitted}
            />
          )}
        </CloseOnSubmit>
      ) : null}
    </RouteDialog>
  );
}
