import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AIChatProvider,
  AIChatWindow,
  ChatPage,
  NocoBaseAIRootProvider,
  useAI,
} from '@/extensions/nocobase-ai/index.js';
import { useTranslation } from '@nocobase/i18n/client';
import { LibraryIcon } from 'lucide-react';
import { Link } from 'react-router';
import type { ReactElement } from 'react';

/**
 * The single AI employee this application exposes, as registered by
 * `server/ai/employees/materials-assistant`. The client only names it; the
 * server owns its prompt, its scope and its one tool.
 */
const ASSISTANT_USERNAME = 'materials-assistant';

/**
 * The materials assistant.
 *
 * The chat itself is the AI employee plugin's surface: it persists
 * conversations, streams answers and resolves the employee's tool. What this
 * page adds is the application's own boundary around it — one fixed employee,
 * no attachments, no web search, no per-user prompt editing — and an honest
 * state when no AI service is configured. When the service is unavailable the
 * page says so and points at the materials for manual reading; it never
 * substitutes a canned reply for a real answer.
 */
export default function MaterialsAssistantPage(): ReactElement {
  const { t } = useTranslation();

  return (
    <PageContainer>
      <PageHeader
        title={t('assistant.title')}
        description={t('assistant.description')}
        actions={
          <Link
            className={buttonVariants({ variant: 'outline' })}
            to='/materials'
          >
            <LibraryIcon aria-hidden='true' className='size-4' />
            {t('assistant.manualLink')}
          </Link>
        }
      />

      <NocoBaseAIRootProvider>
        <AIChatProvider
          defaultEmployee={ASSISTANT_USERNAME}
          id='materials-assistant'
        >
          <AssistantSurface />
        </AIChatProvider>
      </NocoBaseAIRootProvider>
    </PageContainer>
  );
}

function AssistantSurface(): ReactElement {
  const { t } = useTranslation();
  const { configurationStatus, employees, hasEnabledModels } = useAI();
  const assistant = employees.find(
    (employee) => employee.username === ASSISTANT_USERNAME,
  );

  if (configurationStatus === 'loading') {
    return (
      <div className='space-y-3 rounded-xl border border-border p-6'>
        <Skeleton className='h-5 w-40' />
        <Skeleton className='h-4 w-full' />
        <Skeleton className='h-4 w-3/4' />
      </div>
    );
  }

  if (configurationStatus === 'error' || !hasEnabledModels || !assistant) {
    return <AssistantUnavailable />;
  }

  return (
    <ChatPage>
      <AIChatWindow
        // Attachments, web search and per-user prompt editing are all off: this
        // assistant reads the application's materials and does nothing else.
        enableAttachments={false}
        enableWebSearch={false}
        placeholder={t('assistant.placeholder')}
        showEmployeeSelector={false}
        showUserPrompt={false}
      />
    </ChatPage>
  );
}

function AssistantUnavailable(): ReactElement {
  const { t } = useTranslation();
  return (
    <Alert>
      <AlertTitle>{t('assistant.unavailableTitle')}</AlertTitle>
      <AlertDescription>
        <p>{t('assistant.unavailableDescription')}</p>
        <p className='mt-2'>{t('assistant.unavailableManualHint')}</p>
      </AlertDescription>
      <AlertAction>
        <Link
          className={buttonVariants({ size: 'sm', variant: 'outline' })}
          to='/materials'
        >
          {t('assistant.manualLink')}
        </Link>
      </AlertAction>
    </Alert>
  );
}
