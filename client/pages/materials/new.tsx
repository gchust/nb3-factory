import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { RouteChildPage } from '@/components/route-child-page';

import { MaterialForm } from './shared.js';

export default function MaterialCreatePage(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <RouteChildPage>
      <PageContainer>
        <Breadcrumbs />
        <PageHeader
          title={t('materials.create.title')}
          description={t('materials.create.description')}
        />
        <Card>
          <CardContent>
            <MaterialForm
              mode='create'
              onSaved={(material) => void navigate(String(material.id))}
              onCancel={() => void navigate('..')}
            />
          </CardContent>
        </Card>
      </PageContainer>
    </RouteChildPage>
  );
}
