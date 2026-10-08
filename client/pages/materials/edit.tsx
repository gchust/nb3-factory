import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router';

import { BackButton } from '@/components/back-button';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { RouteChildPage } from '@/components/route-child-page';
import { Button } from '@/components/ui/button';

import { MaterialsForm } from './materials-form.js';
import type { Material, MaterialDetailOutletContext } from './types.js';

/**
 * Editing a material, laid over the material it belongs to. It reuses the
 * create form: the same fields, validation and submission, with the record's
 * current title and attachments as the starting point.
 */
export default function EditMaterialPage(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { material, onSaved, onNotFound } =
    useOutletContext<MaterialDetailOutletContext>();
  const [submitting, setSubmitting] = useState(false);

  const onSubmitted = (material: Material): void => {
    onSaved(material);
    void navigate('..', { replace: true });
  };

  const handleNotFound = (): void => {
    onNotFound();
    void navigate('../..', { replace: true });
  };

  return (
    <RouteChildPage>
      <PageContainer>
        <BackButton />
        <PageHeader title={t('materials.edit.title')} />
        <MaterialsForm
          material={material}
          formId='material-edit-form'
          onSubmitted={onSubmitted}
          onSubmittingChange={setSubmitting}
          onNotFound={handleNotFound}
        />
        <div className='flex items-center gap-2'>
          <Button type='submit' form='material-edit-form' disabled={submitting}>
            {submitting ? t('materials.form.saving') : t('materials.form.save')}
          </Button>
        </div>
      </PageContainer>
    </RouteChildPage>
  );
}
