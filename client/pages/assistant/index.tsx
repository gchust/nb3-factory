import { useTranslation } from '@nocobase/i18n/client';
import { BookOpenText } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AIChatProvider,
  AIChatWindow,
  ChatPage,
  NocoBaseAIRootProvider,
  useAI,
} from '@/extensions/nocobase-ai';

import { documentToolRenderers } from './tool-renderers.js';

/** The username of the employee `server/ai/employees/document-assistant` registers. */
const DOCUMENT_ASSISTANT = 'documents-assistant';

/**
 * The unconfigured or unavailable state.
 *
 * It names what is missing and keeps the documents reachable, because the assistant is a convenience
 * over reading them, never a replacement for it. It never answers in the assistant's voice: a chat
 * that cannot reach a model must not look like one that can.
 */
function AssistantUnavailable({ message }: { message: string }): ReactElement {
  const { t } = useTranslation();
  return (
    <div
      className='space-y-3 rounded-xl border border-border bg-muted/30 p-5'
      role='alert'
    >
      <div>
        <p className='font-medium text-foreground'>
          {t('assistant.unavailableTitle')}
        </p>
        <p className='mt-1 text-sm text-muted-foreground'>{message}</p>
      </div>
      <p className='text-sm text-muted-foreground'>
        {t('assistant.unavailableHint')}
      </p>
      <Link className={buttonVariants({ variant: 'outline' })} to='/documents'>
        <BookOpenText />
        {t('assistant.openDocuments')}
      </Link>
    </div>
  );
}

/**
 * The chat, once employee and model discovery have finished.
 *
 * The gate exists because `NocoBaseAIRootProvider` starts discovery asynchronously and does not defer
 * mounting its children: a chat mounted before discovery finishes initializes against an empty
 * configuration and its first send fails. So the chat is mounted only after every signal that
 * decides whether it can send is settled, and each failure gets its own message.
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
      <div aria-busy='true' className='space-y-3'>
        <Skeleton className='h-96 w-full' />
        <p
          aria-live='polite'
          className='text-sm text-muted-foreground'
          role='status'
        >
          {t('assistant.loading')}
        </p>
      </div>
    );
  }

  if (configurationStatus === 'error') {
    return (
      <AssistantUnavailable
        message={configurationError?.message ?? t('assistant.configError')}
      />
    );
  }

  if (!employees.length) {
    return <AssistantUnavailable message={t('assistant.noEmployees')} />;
  }

  if (modelConfigurationError) {
    return <AssistantUnavailable message={modelConfigurationError.message} />;
  }

  if (!hasEnabledModels) {
    return <AssistantUnavailable message={t('assistant.noModels')} />;
  }

  return (
    <AIChatProvider
      defaultEmployee={DOCUMENT_ASSISTANT}
      id='documents-assistant'
    >
      {/* File attachments and web search stay off: this assistant only reads the documents the
          asker may already see, and neither capability is part of that. */}
      <ChatPage>
        <AIChatWindow placeholder={t('assistant.placeholder')} />
      </ChatPage>
    </AIChatProvider>
  );
}

/**
 * The document assistant page.
 *
 * It is deliberately only a chat over the documents collection: the employee can call one read-only
 * tool, whose links are rendered by `DocumentSourcesRenderer`, and the readiness gate above decides
 * whether a chat is mounted at all.
 */
export default function AssistantPage(): ReactElement {
  const { t } = useTranslation();
  return (
    <PageContainer>
      <PageHeader
        title={t('assistant.title')}
        description={t('assistant.description')}
        actions={
          <Link
            className={buttonVariants({ variant: 'outline' })}
            to='/documents'
          >
            <BookOpenText />
            {t('navigation.documents')}
          </Link>
        }
      />
      <NocoBaseAIRootProvider toolRenderers={documentToolRenderers}>
        <ConfiguredAssistant />
      </NocoBaseAIRootProvider>
    </PageContainer>
  );
}
