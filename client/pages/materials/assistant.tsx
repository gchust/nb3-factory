import { useTranslation } from '@nocobase/i18n/client';
import { BotIcon } from 'lucide-react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import {
  AIChatProvider,
  AIChatWindow,
  ChatInline,
  NocoBaseAIRootProvider,
  useAI,
} from '@/extensions/nocobase-ai';

/**
 * The internal-materials assistant. The readiness gate is a child of the root
 * provider that reads `useAI()`: a chat mounted before model discovery
 * completes would initialize against an empty configuration and fail on its
 * first send, so nothing under it renders until the configuration is usable.
 */
export default function MaterialsAssistantPage() {
  return (
    <PageContainer>
      <PageHeader
        title={<AssistantTitle />}
        description={<AssistantDescription />}
      />
      <NocoBaseAIRootProvider>
        <ConfiguredChat />
      </NocoBaseAIRootProvider>
    </PageContainer>
  );
}

function AssistantTitle() {
  const { t } = useTranslation();
  return (
    <>
      <BotIcon className='mr-2 inline size-6 text-muted-foreground' />
      {t('materials.assistant.title')}
    </>
  );
}

function AssistantDescription() {
  const { t } = useTranslation();
  return t('materials.assistant.description');
}

function ConfiguredChat() {
  const { t } = useTranslation();
  const {
    configurationStatus,
    configurationError,
    modelConfigurationError,
    employees,
    hasEnabledModels,
  } = useAI();

  if (configurationStatus === 'loading') {
    return (
      <p role='status' className='text-sm text-muted-foreground'>
        {t('materials.assistant.loading')}
      </p>
    );
  }

  if (configurationStatus === 'error') {
    return (
      <AssistantNotice
        message={
          configurationError?.message ??
          t('materials.assistant.configurationFailed')
        }
        hint={t('materials.assistant.configurationHint')}
      />
    );
  }

  if (!employees.length) {
    return (
      <AssistantNotice
        message={t('materials.assistant.noEmployee')}
        hint={t('materials.assistant.configurationHint')}
      />
    );
  }

  if (modelConfigurationError) {
    return (
      <AssistantNotice
        message={modelConfigurationError.message}
        hint={t('materials.assistant.modelHint')}
      />
    );
  }

  if (!hasEnabledModels) {
    return (
      <AssistantNotice
        message={t('materials.assistant.noModel')}
        hint={t('materials.assistant.modelHint')}
      />
    );
  }

  return (
    <AIChatProvider
      id='materials-assistant'
      defaultEmployee='materials-assistant'
    >
      <ChatInline>
        <AIChatWindow
          enableAttachments={false}
          placeholder={t('materials.assistant.placeholder')}
          disclaimer={t('materials.assistant.disclaimer')}
        />
      </ChatInline>
    </AIChatProvider>
  );
}

function AssistantNotice({
  message,
  hint,
}: {
  readonly message: string;
  readonly hint: string;
}) {
  return (
    <div
      role='alert'
      className='rounded-xl border border-dashed bg-muted/40 p-6 text-sm'
    >
      <p className='font-medium text-foreground'>{message}</p>
      <p className='mt-2 text-muted-foreground'>{hint}</p>
    </div>
  );
}
