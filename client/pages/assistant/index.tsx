import { useTranslation } from '@nocobase/i18n/client';
import { BotIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AIChatProvider,
  AIChatWindow,
  ChatInline,
  NocoBaseAIRootProvider,
  useAI,
} from '@/extensions/nocobase-ai';

/**
 * The assistant page.
 *
 * The chat is the plugin's own surface wrapped in its root provider, and the
 * whole chat subtree sits behind a readiness gate. The gate matters: the root
 * provider mounts its children before employee and model discovery finishes,
 * so a chat started early would initialize against an empty configuration and
 * fail on the first send. Without an enabled model the gate shows an explicit
 * "not configured" notice instead, which is what keeps the page honest when
 * the test environment has no AI service — reading the materials page still
 * works, only the assistant is unavailable.
 */
export default function AssistantPage(): ReactElement {
  return (
    <NocoBaseAIRootProvider>
      <AssistantSurface />
    </NocoBaseAIRootProvider>
  );
}

function AssistantSurface(): ReactElement {
  const { t } = useTranslation();
  const {
    configurationError,
    configurationStatus,
    employees,
    hasEnabledModels,
    modelConfigurationError,
  } = useAI();

  return (
    <PageContainer className='flex min-h-[calc(100svh-4rem)] flex-col'>
      <PageHeader
        description={t('assistant.description')}
        title={t('assistant.title')}
      />
      <div className='flex min-h-0 flex-1 flex-col'>
        {configurationStatus === 'loading' ? (
          <Alert>
            <AlertTitle>{t('assistant.loading')}</AlertTitle>
            <AlertDescription>{t('assistant.loadingHint')}</AlertDescription>
          </Alert>
        ) : null}

        {configurationStatus === 'error' ? (
          <Alert variant='destructive'>
            <AlertTitle>{t('assistant.unavailableTitle')}</AlertTitle>
            <AlertDescription>
              {configurationError?.message ?? t('assistant.loadFailed')}
            </AlertDescription>
          </Alert>
        ) : null}

        {configurationStatus === 'ready' && employees.length === 0 ? (
          <Alert>
            <AlertTitle>{t('assistant.unavailableTitle')}</AlertTitle>
            <AlertDescription>{t('assistant.noEmployee')}</AlertDescription>
          </Alert>
        ) : null}

        {configurationStatus === 'ready' && employees.length > 0 ? (
          modelConfigurationError || !hasEnabledModels ? (
            <Alert>
              <BotIcon />
              <AlertTitle>{t('assistant.notConfiguredTitle')}</AlertTitle>
              <AlertDescription className='space-y-2'>
                <p>
                  {modelConfigurationError?.message ??
                    t('assistant.notConfiguredDescription')}
                </p>
                <p>{t('assistant.notConfiguredHint')}</p>
              </AlertDescription>
            </Alert>
          ) : (
            <div className='min-h-0 flex-1'>
              <AIChatProvider
                defaultEmployee='materials-desk'
                id='materials-assistant'
              >
                <ChatInline>
                  <AIChatWindow />
                </ChatInline>
              </AIChatProvider>
            </div>
          )
        ) : null}
      </div>
    </PageContainer>
  );
}
