import { ApiClientError } from '@nocobase/app-client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon, InboxIcon } from 'lucide-react';
import type { ComponentProps, ReactElement, ReactNode } from 'react';

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import type {
  DeliverableStatus,
  MilestoneStatus,
  ProjectStatus,
  TaskPriority,
  TaskStatus,
} from './types.js';

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>['variant']>;

const PROJECT_STATUS_VARIANT: Record<ProjectStatus, BadgeVariant> = {
  active: 'default',
  completed: 'secondary',
  archived: 'outline',
};

const MILESTONE_STATUS_VARIANT: Record<MilestoneStatus, BadgeVariant> = {
  open: 'outline',
  in_progress: 'default',
  completed: 'secondary',
};

const TASK_STATUS_VARIANT: Record<TaskStatus, BadgeVariant> = {
  not_started: 'outline',
  in_progress: 'default',
  pending_acceptance: 'secondary',
  completed: 'secondary',
};

const DELIVERABLE_STATUS_VARIANT: Record<DeliverableStatus, BadgeVariant> = {
  pending: 'secondary',
  accepted: 'default',
  rejected: 'destructive',
};

const PRIORITY_VARIANT: Record<TaskPriority, BadgeVariant> = {
  low: 'outline',
  normal: 'ghost',
  high: 'destructive',
};

export function ProjectStatusBadge({
  status,
}: {
  readonly status: ProjectStatus;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={PROJECT_STATUS_VARIANT[status]}>
      {t(`projects.projectStatus.${status}`)}
    </Badge>
  );
}

export function MilestoneStatusBadge({
  status,
}: {
  readonly status: MilestoneStatus;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={MILESTONE_STATUS_VARIANT[status]}>
      {t(`projects.milestoneStatus.${status}`)}
    </Badge>
  );
}

export function TaskStatusBadge({
  status,
}: {
  readonly status: TaskStatus;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={TASK_STATUS_VARIANT[status]}>
      {t(`projects.taskStatus.${status}`)}
    </Badge>
  );
}

export function DeliverableStatusBadge({
  status,
}: {
  readonly status: DeliverableStatus;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={DELIVERABLE_STATUS_VARIANT[status]}>
      {t(`projects.deliverableStatus.${status}`)}
    </Badge>
  );
}

export function PriorityBadge({
  priority,
}: {
  readonly priority: TaskPriority;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={PRIORITY_VARIANT[priority]}>
      {t(`projects.priority.${priority}`)}
    </Badge>
  );
}

export function ProgressBar({
  value,
  label,
}: {
  readonly value: number;
  readonly label?: string;
}): ReactElement {
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      aria-label={label}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={percent}
      className='h-2 w-full overflow-hidden rounded-full bg-muted'
      role='progressbar'
    >
      <div
        className='h-full rounded-full bg-primary transition-[width]'
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

/** The card frame a detail section uses: a titled surface with an optional action on the right. */
export function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** A quiet placeholder for a section that holds nothing yet. */
export function EmptyHint({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <p className='flex items-center gap-2 py-6 text-sm text-muted-foreground'>
      <InboxIcon aria-hidden='true' className='size-4' />
      {children}
    </p>
  );
}

/**
 * The failure state of a page's first load: a session that ended offers signing in again, a forbidden request offers
 * nothing to retry, and anything else can be retried.
 */
export function ErrorState({
  error,
  onRetry,
}: {
  readonly error: unknown;
  readonly onRetry?: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const { refresh } = useAuthentication();

  if (error instanceof ApiClientError && error.status === 401) {
    return (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('status.sessionExpired')}</AlertTitle>
        <AlertDescription>
          {t('status.sessionExpiredDescription')}
        </AlertDescription>
        <AlertAction>
          <Button size='sm' variant='outline' onClick={() => void refresh()}>
            {t('actions.signInAgain')}
          </Button>
        </AlertAction>
      </Alert>
    );
  }

  const forbidden = error instanceof ApiClientError && error.status === 403;
  return (
    <Alert variant='destructive'>
      <AlertCircleIcon />
      <AlertTitle>{t('projects.error.title')}</AlertTitle>
      <AlertDescription>
        {forbidden
          ? t('projects.error.forbidden')
          : t('projects.error.requestFailed')}
      </AlertDescription>
      {forbidden || !onRetry ? null : (
        <AlertAction>
          <Button size='sm' variant='outline' onClick={onRetry}>
            {t('status.retry')}
          </Button>
        </AlertAction>
      )}
    </Alert>
  );
}
