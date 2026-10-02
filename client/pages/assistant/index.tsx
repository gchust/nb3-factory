import { useTranslation } from '@nocobase/i18n/client';
import { LoaderCircleIcon, TriangleAlertIcon } from 'lucide-react';
import { type ReactElement } from 'react';
import { Link } from 'react-router';

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

/** The application-owned employee registered in server/ai/employees. */
const EMPLOYEE = 'materials-assistant';
/** A stable chat id, so a refresh reopens the same conversation scene. */
const CHAT_ID = 'materials-assistant-chat';

/**
 * The read-only assistant. It talks only to `materials-assistant`, whose only
 * tool is a document lookup that the server scopes to the caller's grants, and
 * it mounts no attachment or web-search control. When no model is enabled the
 * chat cannot answer; the page says so and sends the user to the documents
 * instead of leaving a composer that would fail on the first send.
 */
export default function AssistantPage(): ReactElement {
  const { t } = useTranslation();
  return (
    <PageContainer>
      <PageHeader
        title={t('assistant.title')}
        description={t('assistant.description')}
      />
      <NocoBaseAIRootProvider>
        <ConfiguredChat />
      </NocoBaseAIRootProvider>
    </PageContainer>
  );
}

/**
 * The readiness gate. Employee discovery, model discovery and the chat itself
 * are separate signals: a chat mounted before discovery finishes initializes
 * against an empty configuration, so the whole `AIChatProvider` subtree waits
 * here until it can actually send.
 */
function ConfiguredChat(): ReactElement {
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
      <Alert>
        <LoaderCircleIcon className='animate-spin' />
        <AlertTitle>{t('assistant.loadingTitle')}</AlertTitle>
        <AlertDescription>{t('assistant.loadingDescription')}</AlertDescription>
      </Alert>
    );
  }

  if (configurationStatus === 'error') {
    return (
      <AssistantUnavailable
        detail={configurationError?.message ?? t('assistant.reasonLoadFailed')}
      />
    );
  }

  if (!employees.some((employee) => employee.username === EMPLOYEE)) {
    return <AssistantUnavailable detail={t('assistant.reasonNoEmployee')} />;
  }

  if (modelConfigurationError || !hasEnabledModels) {
    return <AssistantUnavailable detail={t('assistant.reasonNoModel')} />;
  }

  return (
    <AIChatProvider id={CHAT_ID} defaultEmployee={EMPLOYEE}>
      <ChatPage>
        <AIChatWindow
          // Only this application's employee answers; there is no router or
          // sub-agent to hand the question to in this version.
          showEmployeeSelector={false}
          placeholder={t('assistant.placeholder')}
          disclaimer={t('assistant.disclaimer')}
        />
      </ChatPage>
    </AIChatProvider>
  );
}

/**
 * The unconfigured state, stated plainly: the assistant cannot answer, and the
 * documents it would have cited remain readable by hand.
 */
function AssistantUnavailable({
  detail,
}: {
  readonly detail: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Alert variant='destructive'>
      <TriangleAlertIcon />
      <AlertTitle>{t('assistant.unavailableTitle')}</AlertTitle>
      <AlertDescription>
        <p>{t('assistant.unavailableDescription')}</p>
        <p className='text-xs'>{detail}</p>
        <p className='mt-2'>{t('assistant.manualFallback')}</p>
        <Button
          className='mt-3 w-fit'
          variant='outline'
          size='sm'
          render={<Link to='/materials' />}
        >
          {t('assistant.openMaterials')}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
