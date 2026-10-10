import { useTranslation } from '@nocobase/i18n/client';
import { Link } from 'react-router';
import type { ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  AIChatProvider,
  AIChatWindow,
  ChatPage,
  NocoBaseAIRootProvider,
  useAI,
} from '@/extensions/nocobase-ai';

const ASSISTANT_USERNAME = 'materials-assistant';
const CHAT_ID = 'materials-assistant-chat';

/**
 * The read-only materials assistant.
 *
 * The chat is gated: `NocoBaseAIRootProvider` discovers employees and models
 * asynchronously without holding back its children, so a chat mounted before
 * discovery finishes would initialize against an empty configuration and its
 * first send would fail. Nothing here mounts `AIChatProvider` until the three
 * readiness signals have been checked, and when the assistant cannot run the
 * page says so plainly and points at the materials instead of showing a
 * composer that pretends to work.
 *
 * Attachments, web search and the employee selector stay off: this version of
 * the assistant may only answer from the internal materials, and every one of
 * those would offer a way around that.
 */
export default function AssistantPage(): ReactElement {
  return (
    <NocoBaseAIRootProvider>
      <AssistantPageFrame />
    </NocoBaseAIRootProvider>
  );
}

function AssistantPageFrame(): ReactElement {
  const { t } = useTranslation();
  const {
    configurationStatus,
    configurationError,
    modelConfigurationError,
    employees,
    hasEnabledModels,
  } = useAI();

  let body: ReactElement;

  if (configurationStatus === 'loading') {
    body = (
      <p className='text-sm text-muted-foreground' role='status'>
        {t('assistant.loadingConfig')}
      </p>
    );
  } else if (configurationStatus === 'error') {
    body = (
      <UnavailableAlert
        title={t('assistant.configFailed')}
        description={
          configurationError?.message
            ? `${t('assistant.configHint')} ${configurationError.message}`
            : t('assistant.configHint')
        }
      />
    );
  } else if (employees.length === 0) {
    body = (
      <UnavailableAlert
        title={t('assistant.noEmployees')}
        description={t('assistant.configHint')}
      />
    );
  } else if (modelConfigurationError) {
    body = (
      <UnavailableAlert
        title={t('assistant.modelFailed')}
        description={`${t('assistant.configHint')} ${modelConfigurationError.message}`}
      />
    );
  } else if (!hasEnabledModels) {
    body = (
      <UnavailableAlert
        title={t('assistant.noModel')}
        description={t('assistant.noModelHint')}
      />
    );
  } else {
    body = (
      <AIChatProvider id={CHAT_ID} defaultEmployee={ASSISTANT_USERNAME}>
        <ChatPage>
          <AIChatWindow
            showEmployeeSelector={false}
            showModelSelector={false}
            disclaimer={t('assistant.readOnlyNotice')}
          />
        </ChatPage>
      </AIChatProvider>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('assistant.title')}
        description={t('assistant.description')}
      />
      {body}
    </PageContainer>
  );
}

function UnavailableAlert({
  title,
  description,
}: {
  readonly title: string;
  readonly description: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Alert variant='destructive'>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{description}</p>
        <Button
          variant='outline'
          size='sm'
          className='mt-3'
          render={<Link to='/materials' />}
        >
          {t('assistant.openMaterials')}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
