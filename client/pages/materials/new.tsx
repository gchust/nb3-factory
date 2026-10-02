import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeftIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link, useNavigate } from 'react-router';

import { Button } from '@/components/ui/button';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { createMaterial } from './api.js';
import { MaterialEditor } from './editor.js';

export default function NewMaterialPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const navigate = useNavigate();

  return (
    <PageContainer>
      <PageHeader
        title={t('materials.new.title')}
        description={t('materials.new.description')}
        actions={
          <Button variant='outline' render={<Link to='/materials' />}>
            <ArrowLeftIcon data-icon='inline-start' />
            {t('materials.new.back')}
          </Button>
        }
      />

      <MaterialEditor
        submitLabel={t('materials.new.submit')}
        busyLabel={t('materials.new.saving')}
        onSubmit={async ({ title, fileIds }) => {
          const material = await createMaterial(api, { title, fileIds });
          toaster.show({
            type: 'success',
            title: t('materials.new.savedTitle'),
            description: t('materials.new.savedDescription'),
          });
          void navigate(`/materials/${material.id}`, { replace: true });
        }}
      />
    </PageContainer>
  );
}