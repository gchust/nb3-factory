import { ApiClientError } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { SessionExpiredAlert } from '#components/session-expired-alert';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '#components/ui/alert';
import { Button } from '#components/ui/button';

/**
 * A read that failed, drawn the same way on every page.
 *
 * A 401 means the session ended, which only signing in again can fix, so it becomes `SessionExpiredAlert`. Anything
 * else keeps the retry, and the page supplies the wording because only it knows what it was loading.
 */
export function RequestFailed({
  error,
  title,
  description,
  onRetry,
}: {
  readonly error: unknown;
  readonly title: string;
  readonly description: string;
  readonly onRetry?: () => void;
}): ReactElement {
  const { t } = useTranslation();
  if (error instanceof ApiClientError && error.status === 401) {
    return <SessionExpiredAlert />;
  }
  return (
    <Alert variant='destructive'>
      <AlertCircleIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
      {onRetry ? (
        <AlertAction>
          <Button variant='outline' size='sm' onClick={onRetry}>
            {t('status.retry')}
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  );
}
