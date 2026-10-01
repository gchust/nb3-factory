import { useTranslation } from '@nocobase/i18n/client';
import { useState, type PropsWithChildren, type ReactElement } from 'react';

import {
  AIChatFloatingTrigger,
  AIChatProvider,
  AIChatWindow,
  ChatInline,
  ChatPage,
  ChatSurface,
  ChatSurfaceActions,
  NocoBaseAIRootProvider,
  useAI,
  useAIChatController,
  useAIChatControllerState,
} from '@/extensions/nocobase-ai';

/**
 * The application's AI service assistant.
 *
 * The plugin owns the models, conversations and transport; this is the chat
 * surface the pages mount. `ServiceAssistantBoundary` installs the plugin's
 * root provider so page-context registrations (`useAIForm`, `useAIPageElement`)
 * and the chat share one registry. A chat must only render under a boundary:
 * `NocoBaseAIRootProvider` does not defer its children, so a chat mounted
 * before employee and model discovery finishes would initialize empty.
 */
function useAssistantReady(): {
  readonly ready: boolean;
  readonly message: string | null;
} {
  const { t } = useTranslation();
  const {
    configurationStatus,
    configurationError,
    modelConfigurationError,
    employees,
    hasEnabledModels,
  } = useAI();

  if (configurationStatus === 'loading') {
    return { ready: false, message: t('service.assistant.loading') };
  }
  if (configurationStatus === 'error') {
    return {
      ready: false,
      message:
        configurationError?.message ??
        t('service.assistant.configurationError'),
    };
  }
  if (!employees.length) {
    return { ready: false, message: t('service.assistant.noEmployees') };
  }
  if (modelConfigurationError) {
    return { ready: false, message: modelConfigurationError.message };
  }
  if (!hasEnabledModels) {
    return { ready: false, message: t('service.assistant.noModel') };
  }
  return { ready: true, message: null };
}

function ReadinessNotice({
  message,
}: {
  readonly message: string;
}): ReactElement {
  return (
    <div
      role='alert'
      className='rounded-xl border border-dashed bg-muted/40 p-6 text-sm text-muted-foreground'
    >
      {message}
    </div>
  );
}

/** Inline chat for the assistant page. Requires a `ServiceAssistantBoundary`. */
export function ServiceAssistantChat(): ReactElement {
  const { ready, message } = useAssistantReady();
  if (!ready) return <ReadinessNotice message={message ?? ''} />;
  return (
    <AIChatProvider
      id='service-assistant-chat'
      defaultEmployee='service-assistant'
    >
      <ChatPage>
        <ChatInline>
          <AIChatWindow enableAttachments enableWebSearch />
        </ChatInline>
      </ChatPage>
    </AIChatProvider>
  );
}

/** Floating chat for a detail page. Requires a `ServiceAssistantBoundary`. */
export function ServiceAssistantPanel(): ReactElement {
  const { t } = useTranslation();
  const controller = useAIChatController();
  const { open } = useAIChatControllerState(controller);
  const [expanded, setExpanded] = useState(false);
  const { ready, message } = useAssistantReady();

  if (!ready) {
    return (
      <div className='print:hidden'>
        <ReadinessNotice message={message ?? ''} />
      </div>
    );
  }

  const onOpenChange = (next: boolean): void => {
    if (!next) setExpanded(false);
    controller.setOpen(next);
  };

  return (
    <AIChatProvider
      id='service-assistant-panel'
      controller={controller}
      defaultEmployee='service-assistant'
    >
      <AIChatFloatingTrigger controller={controller} />
      <ChatSurface
        open={open}
        variant={expanded ? 'dialog' : 'side-panel'}
        onOpenChange={onOpenChange}
        width={450}
      >
        <AIChatWindow
          enableAttachments
          enableWebSearch
          headerActions={
            <ChatSurfaceActions
              expanded={expanded}
              onExpandedChange={setExpanded}
              onClose={() => onOpenChange(false)}
            />
          }
          placeholder={t('service.assistant.placeholder')}
        />
      </ChatSurface>
    </AIChatProvider>
  );
}

/** Installs the AI root provider. Wrap every assistant surface and page-context registration. */
export function ServiceAssistantBoundary({
  children,
}: PropsWithChildren): ReactElement {
  return <NocoBaseAIRootProvider>{children}</NocoBaseAIRootProvider>;
}
