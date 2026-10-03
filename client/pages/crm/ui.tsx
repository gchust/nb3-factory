import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';

/** The placeholder shown while a page's first request is in flight. */
export function LoadingState(): ReactElement {
  return (
    <div className='flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground'>
      <Spinner />
    </div>
  );
}

/** The failure state for a page that could not load, with a retry action. */
export function LoadFailedState({
  onRetry,
}: {
  readonly onRetry: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <AlertCircleIcon />
        </EmptyMedia>
        <EmptyTitle>{t('crm.error.loadFailed')}</EmptyTitle>
        <EmptyDescription>
          {t('crm.error.loadFailedDescription')}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant='outline' onClick={onRetry}>
          {t('crm.action.retry')}
        </Button>
      </EmptyContent>
    </Empty>
  );
}

/** The empty state for a list that has no rows yet, with its create action. */
export function EmptyState({
  title,
  description,
  action,
}: {
  readonly title: string;
  readonly description: string;
  readonly action?: ReactElement;
}): ReactElement {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}
