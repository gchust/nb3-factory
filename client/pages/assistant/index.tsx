import { useTranslation } from '@nocobase/i18n/client';
import { BookOpenText, TriangleAlert } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
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

/** The employee this page talks to. It is registered by the server, so the name is the only thing the page needs. */
const ASSISTANT_EMPLOYEE = 'knowledge-assistant';

/**
 * What the page shows when it has nothing to chat with, and the one thing the reader can still do.
 *
 * Whenever the assistant is unavailable the materials page is not: reading is an ordinary page, and the reader must
 * be able to fall back to it. So every unavailable state ends here, with the reason and a link to the materials.
 */
function UnavailableNotice({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Alert>
      <TriangleAlert />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{children}</p>
        <Button
          className='mt-3'
          size='sm'
          variant='outline'
          render={<Link to='/materials' />}
        >
          <BookOpenText data-icon='inline-start' />
          {t('knowledge.assistant.openMaterials')}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/**
 * The chat, once the configuration proves a message can be sent.
 *
 * The checks are separate because they can disagree: discovery can be `ready` while the model request failed, and a
 * missing model is not the same as a missing employee. `useAI` is read here, under the root provider, so the
 * children are not mounted until the answer is known — mounting first and covering it with a spinner would leave a
 * chat initialized against an empty configuration.
 */
function ConfiguredAssistant(): ReactElement {
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
      <p className='text-muted-foreground text-sm' role='status'>
        {t('knowledge.assistant.loading')}
      </p>
    );
  }
  if (configurationStatus === 'error') {
    return (
      <UnavailableNotice title={t('knowledge.assistant.errorTitle')}>
        {configurationError?.message ??
          t('knowledge.assistant.errorDescription')}
      </UnavailableNotice>
    );
  }
  if (!employees.length) {
    return (
      <UnavailableNotice title={t('knowledge.assistant.noEmployeeTitle')}>
        {t('knowledge.assistant.noEmployeeDescription')}
      </UnavailableNotice>
    );
  }
  if (modelConfigurationError) {
    return (
      <UnavailableNotice title={t('knowledge.assistant.modelErrorTitle')}>
        {t('knowledge.assistant.modelErrorDescription')}
      </UnavailableNotice>
    );
  }
  if (!hasEnabledModels) {
    return (
      <UnavailableNotice title={t('knowledge.assistant.unconfiguredTitle')}>
        {t('knowledge.assistant.unconfiguredDescription')}
      </UnavailableNotice>
    );
  }

  return (
    <AIChatProvider
      id='knowledge-assistant'
      defaultEmployee={ASSISTANT_EMPLOYEE}
    >
      <ChatPage>
        <AIChatWindow
          enableAttachments={false}
          enableWebSearch={false}
          showEmployeeSelector={false}
          placeholder={t('knowledge.assistant.placeholder')}
        />
      </ChatPage>
    </AIChatProvider>
  );
}

/**
 * The assistant page: one read-only conversation grounded in the materials its reader may see.
 *
 * The page contributes no permission logic of its own beyond its own route grant. Which materials an answer may be
 * built from is decided on the server, by the employee's read tool, against the same stored grants the materials
 * page uses — so there is no second, weaker rule here for someone to reach through.
 */
export default function AssistantPage(): ReactElement {
  const { t } = useTranslation();
  return (
    <PageContainer>
      <PageHeader
        title={t('knowledge.assistant.title')}
        description={t('knowledge.assistant.description')}
      />
      <NocoBaseAIRootProvider>
        <ConfiguredAssistant />
      </NocoBaseAIRootProvider>
    </PageContainer>
  );
}
