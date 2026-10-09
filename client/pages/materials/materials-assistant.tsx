import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement, ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AIChatProvider,
  AIChatWindow,
  ChatInline,
  NocoBaseAIRootProvider,
  useAI,
} from '@/extensions/nocobase-ai';

/**
 * The app-owned employee declared in `server/ai/employees/materials-assistant`.
 * `AIChatProvider` needs it explicitly: without it the chat opens on the
 * lowest-sorted enabled employee, which is the built-in router, not the
 * materials assistant.
 */
const ASSISTANT_USERNAME = 'materials-assistant';

/**
 * The read-only assistant, mounted beside the materials on the page.
 *
 * `NocoBaseAIRootProvider` loads employees and models asynchronously and does
 * not defer its children, so the chat itself is mounted only from a child that
 * has observed a usable configuration. That way the chat never initializes on
 * fallback defaults and silently sends nothing.
 */
export function MaterialsAssistant(): ReactElement {
  return (
    <NocoBaseAIRootProvider>
      <ConfiguredMaterialsAssistant />
    </NocoBaseAIRootProvider>
  );
}

/**
 * Every branch that cannot hold a conversation says so plainly and points at the
 * materials list beside it. Nothing here answers from canned text: an
 * unconfigured model must never look like a working assistant.
 */
function ConfiguredMaterialsAssistant(): ReactElement {
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
      <p className='text-sm text-muted-foreground' role='status'>
        {t('materials.assistant.loading')}
      </p>
    );
  }

  if (configurationStatus === 'error') {
    return (
      <AssistantNotice
        title={t('materials.assistant.unavailable.title')}
        description={
          configurationError?.message ??
          t('materials.assistant.unavailable.description')
        }
      />
    );
  }

  if (!employees.some((employee) => employee.username === ASSISTANT_USERNAME)) {
    return (
      <AssistantNotice
        title={t('materials.assistant.unavailable.title')}
        description={t('materials.assistant.noEmployee')}
      />
    );
  }

  if (modelConfigurationError) {
    return (
      <AssistantNotice
        title={t('materials.assistant.noModel.title')}
        description={modelConfigurationError.message}
      />
    );
  }

  if (!hasEnabledModels) {
    return (
      <AssistantNotice
        title={t('materials.assistant.noModel.title')}
        description={t('materials.assistant.noModel.description')}
      />
    );
  }

  return (
    <AIChatProvider
      id='materials-assistant'
      defaultEmployee={ASSISTANT_USERNAME}
    >
      <ChatInline className='h-[min(70vh,40rem)]'>
        <AIChatWindow enableAttachments={false} enableWebSearch={false} />
      </ChatInline>
    </AIChatProvider>
  );
}

function AssistantNotice({
  title,
  description,
}: {
  readonly title: ReactNode;
  readonly description: ReactNode;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Alert>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className='space-y-1'>
        <p>{description}</p>
        <p>{t('materials.assistant.manualFallback')}</p>
      </AlertDescription>
    </Alert>
  );
}
