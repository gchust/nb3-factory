import { ApiClientError } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement, ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import {
  FOLLOW_UP_STATUS_LABEL_KEYS,
  LEVEL_LABEL_KEYS,
  STAGE_LABEL_KEYS,
  SUGGESTION_KIND_LABEL_KEYS,
  SUGGESTION_STATUS_LABEL_KEYS,
} from './format.js';

/** The badge for an opportunity's stage. */
export function StageBadge({
  stage,
}: {
  readonly stage: string;
}): ReactElement {
  const { t } = useTranslation();
  const key = STAGE_LABEL_KEYS[stage];
  const variant =
    stage === 'won'
      ? 'default'
      : stage === 'lost'
        ? 'destructive'
        : 'secondary';
  return <Badge variant={variant}>{key ? t(key) : stage}</Badge>;
}

/** The badge for a follow-up's status. */
export function FollowUpStatusBadge({
  status,
}: {
  readonly status: string;
}): ReactElement {
  const { t } = useTranslation();
  const key = FOLLOW_UP_STATUS_LABEL_KEYS[status];
  const variant =
    status === 'done'
      ? 'default'
      : status === 'cancelled'
        ? 'outline'
        : 'secondary';
  return <Badge variant={variant}>{key ? t(key) : status}</Badge>;
}

/** A "due now" marker shown beside a follow-up that is past its due time. */
export function OverdueBadge(): ReactElement {
  const { t } = useTranslation();
  return <Badge variant='destructive'>{t('crm.followUps.overdue')}</Badge>;
}

/** The badge for a suggestion's decision status. */
export function SuggestionStatusBadge({
  status,
}: {
  readonly status: string;
}): ReactElement {
  const { t } = useTranslation();
  const key = SUGGESTION_STATUS_LABEL_KEYS[status];
  const variant =
    status === 'approved'
      ? 'default'
      : status === 'dismissed'
        ? 'outline'
        : 'secondary';
  return <Badge variant={variant}>{key ? t(key) : status}</Badge>;
}

/** The badge naming the assistant's reason for a suggestion. */
export function SuggestionKindBadge({
  kind,
}: {
  readonly kind: string;
}): ReactElement {
  const { t } = useTranslation();
  const key = SUGGESTION_KIND_LABEL_KEYS[kind];
  return <Badge variant='outline'>{key ? t(key) : kind}</Badge>;
}

/** The badge for a customer's importance level. */
export function LevelBadge({
  level,
}: {
  readonly level: string;
}): ReactElement {
  const { t } = useTranslation();
  const key = LEVEL_LABEL_KEYS[level];
  return <Badge variant='outline'>{key ? t(key) : level}</Badge>;
}

/**
 * A failed request, explained in the words the API returns where it can be
 * understood, with a Retry that re-runs the load. A 401 and a 403 get a
 * specific sentence because they need a different next step from a network
 * failure.
 */
export function RequestError({
  error,
  onRetry,
}: {
  readonly error: unknown;
  readonly onRetry?: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const message =
    error instanceof ApiClientError
      ? error.status === 401
        ? t('crm.error.unauthenticated')
        : error.status === 403
          ? t('crm.error.forbidden')
          : error.message
      : t('crm.error.network');

  return (
    <Alert variant='destructive'>
      <AlertTitle>{t('crm.error.title')}</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        {onRetry ? (
          <Button
            className='mt-2'
            onClick={onRetry}
            size='sm'
            variant='outline'
          >
            {t('status.retry')}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

/** A one-line "nothing here yet" notice that occupies a whole table body. */
export function EmptyState({
  children,
  colSpan,
}: {
  readonly children: ReactNode;
  readonly colSpan: number;
}): ReactElement {
  return (
    <tr>
      <td
        className='px-3 py-10 text-center text-sm text-muted-foreground'
        colSpan={colSpan}
      >
        {children}
      </td>
    </tr>
  );
}
