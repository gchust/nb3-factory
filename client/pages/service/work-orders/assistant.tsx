import { useTranslation } from '@nocobase/i18n/client';
import { SparklesIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  AIChatProvider,
  AIChatWindow,
  ChatInline,
  NocoBaseAIRootProvider,
  useAI,
} from '@/extensions/nocobase-ai';

/**
 * Reports why the assistant cannot send yet instead of mounting a composer
 * that looks ready. The AI Employee plugin only works when an LLM service and
 * an enabled model are configured; until then this component states the real
 * reason, and the work-order page stays fully usable by hand.
 */
function AssistantReadinessGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const {
    configurationStatus,
    configurationError,
    modelConfigurationError,
    employees,
    hasEnabledModels,
  } = useAI();

  if (configurationStatus === 'loading') {
    return <p role='status'>{t('service.aiAssistant.loading')}</p>;
  }
  if (configurationStatus === 'error') {
    return (
      <p role='alert'>
        {configurationError?.message ?? t('service.aiAssistant.configError')}{' '}
        {t('service.aiAssistant.checkSettings')}
      </p>
    );
  }
  if (!employees.length) {
    return <p role='alert'>{t('service.aiAssistant.noEmployees')}</p>;
  }
  if (modelConfigurationError) {
    return (
      <p role='alert'>
        {modelConfigurationError.message}{' '}
        {t('service.aiAssistant.checkSettings')}
      </p>
    );
  }
  if (!hasEnabledModels) {
    return <p role='alert'>{t('service.aiAssistant.noModel')}</p>;
  }

  return <>{children}</>;
}

export function WorkOrderAIAssistant() {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <SparklesIcon className='size-4' />
          {t('service.aiAssistant.title')}
        </CardTitle>
        <CardDescription>
          {t('service.aiAssistant.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <NocoBaseAIRootProvider>
          <AssistantReadinessGate>
            <AIChatProvider
              id='service-work-order-assistant'
              defaultEmployee='service-assistant'
            >
              <ChatInline>
                <AIChatWindow enableAttachments enableWebSearch />
              </ChatInline>
            </AIChatProvider>
          </AssistantReadinessGate>
        </NocoBaseAIRootProvider>
      </CardContent>
    </Card>
  );
}
