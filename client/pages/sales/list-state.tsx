import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';

/** The first-load state of a list: shapes the rows that are about to arrive, so the page does not jump. */
export function ListSkeleton(): ReactElement {
  const { t } = useTranslation();
  return (
    <div
      className='flex flex-col gap-2'
      role='status'
      aria-label={t('sales.loading')}
    >
      {Array.from({ length: 5 }, (_, index) => (
        <Skeleton key={index} className='h-10 w-full' />
      ))}
    </div>
  );
}

/** The failed state of a list. It never shows the raw message the backend returned. */
export function ListError({
  retry,
}: {
  readonly retry: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Alert variant='destructive'>
      <AlertCircleIcon />
      <AlertTitle>{t('sales.error.title')}</AlertTitle>
      <AlertDescription className='flex flex-col items-start gap-3'>
        <span>{t('sales.error.requestFailed')}</span>
        <Button type='button' variant='outline' size='sm' onClick={retry}>
          {t('sales.error.retry')}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/** The empty state of a list, with the one action that fills it. */
export function SalesEmpty({
  icon,
  title,
  description,
  action,
}: {
  readonly icon: ReactNode;
  readonly title: ReactNode;
  readonly description: ReactNode;
  readonly action?: ReactNode;
}): ReactElement {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant='icon'>{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}
