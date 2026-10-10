import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import {
  AIChatProvider,
  AIChatWindow,
  ChatPage,
  NocoBaseAIRootProvider,
} from '@/extensions/nocobase-ai/index.js';

import { AssistantGate, DOCUMENT_ASSISTANT } from './assistant-gate.js';

/**
 * The document assistant: a colleague asks a question and is answered from the
 * documents their own permission set lets them read, with the title of the
 * document behind each answer, so the answer can be checked on the documents
 * page. Conversations live on the server, so a reload keeps the history.
 *
 * The employee and model selectors are hidden on purpose. This surface is for
 * one employee, and letting it switch to another — the built-in router agent,
 * for example — would move the conversation out of the read-only scope this
 * page promises. Attachments and web search are off for the same reason: this
 * version answers only from the internal documents.
 */
export default function KnowledgeAssistantPage(): ReactElement {
  const { t } = useTranslation();

  return (
    <PageContainer>
      <PageHeader
        title={t('knowledge.assistant.title')}
        description={t('knowledge.assistant.description')}
      />
      <NocoBaseAIRootProvider>
        <AssistantGate>
          <AIChatProvider
            id='knowledge-assistant-chat'
            defaultEmployee={DOCUMENT_ASSISTANT}
            webSearch={false}
          >
            <ChatPage>
              <AIChatWindow
                showEmployeeSelector={false}
                showModelSelector={false}
                showUserPrompt={false}
                enableAttachments={false}
                enableWebSearch={false}
              />
            </ChatPage>
          </AIChatProvider>
        </AssistantGate>
      </NocoBaseAIRootProvider>
    </PageContainer>
  );
}
