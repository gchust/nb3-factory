import type { ReactElement } from 'react';
import { Link } from 'react-router';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon, BookOpenIcon } from 'lucide-react';

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

const ASSISTANT_EMPLOYEE = 'document-assistant';

/**
 * The read-only document assistant.
 *
 * It answers from the documents the signed-in user may read and cites them. The
 * page is deliberately usable without an AI model: when no model is configured
 * it states that plainly and points at the document library, which never needs
 * the model. The assistant itself has no tool that can change data.
 */
export default function AssistantPage(): ReactElement {
  const { t } = useTranslation();
  return (
    <PageContainer className='flex flex-col'>
      <PageHeader
        title={t('assistant.title')}
        description={t('assistant.description')}
        actions={
          <Button variant='outline' render={<Link to='/documents' />}>
            <BookOpenIcon data-icon='inline-start' />
            {t('documents.title')}
          </Button>
        }
      />
      <NocoBaseAIRootProvider>
        <AIChatProvider
          id={ASSISTANT_EMPLOYEE}
          defaultEmployee={ASSISTANT_EMPLOYEE}
        >
          <AssistantSurface />
        </AIChatProvider>
      </NocoBaseAIRootProvider>
    </PageContainer>
  );
}

function AssistantSurface(): ReactElement {
  const { t } = useTranslation();
  const { configurationStatus, hasEnabledModels } = useAI();

  const checking = configurationStatus === 'loading';
  const unavailable =
    configurationStatus === 'error' || (!checking && !hasEnabledModels);

  return (
    <div className='flex min-h-0 flex-col gap-4'>
      {checking ? (
        <p className='text-sm text-muted-foreground'>
          {t('assistant.checking')}
        </p>
      ) : null}
      {unavailable ? (
        <Alert>
          <AlertCircleIcon />
          <AlertTitle>{t('assistant.notConfigured.title')}</AlertTitle>
          <AlertDescription>
            {t('assistant.notConfigured.description')}
          </AlertDescription>
        </Alert>
      ) : null}
      <ChatPage>
        <AIChatWindow />
      </ChatPage>
    </div>
  );
}
