import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useAI } from '@/extensions/nocobase-ai/index.js';

/** The employee this page talks to. */
export const DOCUMENT_ASSISTANT = 'document-assistant';

function Unavailable({
  descriptionKey,
}: {
  readonly descriptionKey: string;
}): ReactElement {
  const { t } = useTranslation();

  return (
    <Alert variant='destructive'>
      <AlertTitle>{t('knowledge.assistant.unavailable.title')}</AlertTitle>
      <AlertDescription className='flex flex-col items-start gap-3'>
        <span>{t(descriptionKey)}</span>
        <span>{t('knowledge.assistant.unavailable.hint')}</span>
        <Button
          variant='outline'
          size='sm'
          render={<Link to='/knowledge/documents' />}
        >
          {t('knowledge.assistant.openDocuments')}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/**
 * Holds the chat back until the AI root has finished discovering employees and
 * models, and until both can actually send: a chat mounted before the first
 * response would initialize against an empty configuration and its first send
 * would fail. Each signal is checked separately, because `configurationStatus`
 * can be ready while model discovery failed and the models array can hold an
 * unconfigured placeholder.
 *
 * When the deployment has no usable AI service the page says so plainly instead
 * of offering a composer that cannot answer; reading the documents still works.
 */
export function AssistantGate({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  const { t } = useTranslation();
  const {
    configurationStatus,
    employees,
    hasEnabledModels,
    modelConfigurationError,
  } = useAI();

  if (configurationStatus === 'loading') {
    return (
      <div className='flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground'>
        <Spinner />
        {t('knowledge.assistant.loading')}
      </div>
    );
  }

  if (configurationStatus === 'error') {
    return (
      <Unavailable descriptionKey='knowledge.assistant.unavailable.configuration' />
    );
  }

  if (!employees.some((employee) => employee.username === DOCUMENT_ASSISTANT)) {
    return (
      <Unavailable descriptionKey='knowledge.assistant.unavailable.employee' />
    );
  }

  if (modelConfigurationError || !hasEnabledModels) {
    return (
      <Unavailable descriptionKey='knowledge.assistant.unavailable.models' />
    );
  }

  return <>{children}</>;
}
