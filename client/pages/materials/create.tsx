import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router';

import { BackButton } from '@/components/back-button';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { RouteChildPage } from '@/components/route-child-page';
import { Button } from '@/components/ui/button';

import { MaterialsForm } from './materials-form.js';
import type { Material, MaterialsOutletContext } from './types.js';

const FORM_ID = 'material-create-form';

/**
 * Creating a material, laid over the list so a filter or a scroll position the
 * user set is still there when it closes. Uploading happens inside the form as
 * soon as a file is chosen; this page only owns the heading and the submit
 * button.
 */
export default function CreateMaterialPage(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { reload } = useOutletContext<MaterialsOutletContext>();
  const [submitting, setSubmitting] = useState(false);

  const onSubmitted = (material: Material): void => {
    reload();
    // Straight to the material so the content that was just uploaded is visible
    // without a second step; `replace` leaves the empty form out of history.
    void navigate(`../${encodeURIComponent(material.id)}`, { replace: true });
  };

  return (
    <RouteChildPage>
      <PageContainer>
        <BackButton />
        <PageHeader title={t('materials.create.title')} />
        <MaterialsForm
          formId={FORM_ID}
          onSubmitted={onSubmitted}
          onSubmittingChange={setSubmitting}
        />
        <div className='flex items-center gap-2'>
          <Button type='submit' form={FORM_ID} disabled={submitting}>
            {submitting
              ? t('materials.form.creating')
              : t('materials.form.create')}
          </Button>
        </div>
      </PageContainer>
    </RouteChildPage>
  );
}
