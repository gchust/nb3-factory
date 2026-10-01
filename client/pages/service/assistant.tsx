import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import {
  ServiceAssistantBoundary,
  ServiceAssistantChat,
} from '@/components/service-assistant';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/**
 * The service assistant page. It mounts the AI Employee chat surface; when no
 * model is configured the surface reports that state instead of pretending to
 * answer, and every other page of the application keeps working.
 */
export default function ServiceAssistantPage(): ReactElement {
  const { t } = useTranslation();

  return (
    <PageContainer>
      <PageHeader
        title={t('service.assistant.title')}
        description={t('service.assistant.description')}
      />
      <div className='space-y-4'>
        <Alert>
          <AlertTitle>{t('service.assistant.groundingTitle')}</AlertTitle>
          <AlertDescription>
            {t('service.assistant.groundingDescription')}
          </AlertDescription>
        </Alert>
        <ServiceAssistantBoundary>
          <ServiceAssistantChat />
        </ServiceAssistantBoundary>
      </div>
    </PageContainer>
  );
}
