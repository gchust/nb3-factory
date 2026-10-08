import { useTranslation } from '@nocobase/i18n/client';
import { FileText, RefreshCw, TriangleAlert } from 'lucide-react';
import { useState, type ReactElement, type ReactNode } from 'react';
import { Link } from 'react-router';

import { Loading } from '@/components/loading';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  AIChatWindow,
  ChatPage,
  NocoBaseAIRootProvider,
} from '@/extensions/nocobase-ai/components/index.js';
import {
  AIChatProvider,
  useAI,
} from '@/extensions/nocobase-ai/providers/index.js';

const EMPLOYEE_USERNAME = 'materials-assistant';

/**
 * The materials assistant.
 *
 * The page never answers a question itself. Everything the assistant says comes from the `materials-assistant` employee
 * through its `read-materials` tool, which applies the same authorization the materials page does. When no model is
 * configured the page says so and points at the library instead of showing a canned reply.
 */
export default function MaterialsAssistantPage(): ReactElement {
  const [revision, setRevision] = useState(0);
  // A new key rebuilds the provider, which is what re-reads the AI configuration after a retry.
  return (
    <NocoBaseAIRootProvider key={revision}>
      <MaterialsAssistantScene
        onRetry={() => setRevision((value) => value + 1)}
      />
    </NocoBaseAIRootProvider>
  );
}

function MaterialsAssistantScene({
  onRetry,
}: {
  readonly onRetry: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const ai = useAI();
  const employee = ai.employees.find(
    (candidate) => candidate.username === EMPLOYEE_USERNAME,
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('assistant.title')}
        description={t('assistant.description')}
        actions={
          <Button variant='outline' render={<Link to='/materials' />}>
            <FileText />
            {t('assistant.openMaterials')}
          </Button>
        }
      />
      {renderBody()}
    </PageContainer>
  );

  function renderBody(): ReactNode {
    if (ai.configurationStatus === 'loading') {
      return <Loading className='min-h-96' />;
    }
    if (ai.configurationStatus === 'error') {
      return (
        <AssistantUnavailable
          description={ai.configurationError?.message}
          onRetry={onRetry}
        />
      );
    }
    if (!ai.hasEnabledModels) {
      return <AssistantUnavailable />;
    }
    if (!employee) {
      return (
        <AssistantUnavailable
          description={t('assistant.unavailable.noEmployee')}
        />
      );
    }
    return (
      <AIChatProvider
        id='materials-assistant-page'
        defaultEmployee={employee.username}
      >
        <ChatPage>
          <AIChatWindow
            showEmployeeSelector={false}
            showModelSelector={false}
            showUserPrompt={false}
            placeholder={t('assistant.placeholder')}
            disclaimer={t('assistant.disclaimer')}
          />
        </ChatPage>
      </AIChatProvider>
    );
  }
}

function AssistantUnavailable({
  description,
  onRetry,
}: {
  readonly description?: string;
  readonly onRetry?: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Alert variant='destructive'>
      <TriangleAlert />
      <AlertTitle>{t('assistant.unavailable.title')}</AlertTitle>
      <AlertDescription>
        {description ?? t('assistant.unavailable.noModel')}
      </AlertDescription>
      <p className='text-sm text-muted-foreground'>
        {t('assistant.unavailable.manualHint')}
      </p>
      <div className='mt-2 flex gap-2'>
        <Button variant='outline' size='sm' render={<Link to='/materials' />}>
          <FileText />
          {t('assistant.openMaterials')}
        </Button>
        {onRetry ? (
          <Button variant='outline' size='sm' onClick={onRetry}>
            <RefreshCw />
            {t('assistant.retry')}
          </Button>
        ) : null}
      </div>
    </Alert>
  );
}
