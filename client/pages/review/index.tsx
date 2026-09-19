import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Loading } from '@/components/loading';
import {
  listRepairs,
  reviewRepair,
  useAsync,
} from '@/components/inspection/api.js';
import { formatDateTime } from '@/components/inspection/format.js';
import {
  PriorityBadge,
  RepairStatusBadge,
} from '@/components/inspection/status-badge.js';
import type { RepairOrder } from '@/components/inspection/types.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function ReviewPage(): ReactElement {
  const { t } = useTranslation();
  const repairs = useAsync('repairs', listRepairs);
  const pending = (repairs.data ?? []).filter(
    (order) => order.status === 'review',
  );
  const [error, setError] = useState('');

  return (
    <PageContainer className='mx-auto max-w-4xl'>
      <PageHeader
        title={t('review.title')}
        description={t('review.description')}
      />
      {repairs.loading ? (
        <Loading label={t('status.loading')} />
      ) : repairs.error ? (
        <p role='alert' className='text-sm text-destructive'>
          {t('review.loadFailed')}
        </p>
      ) : pending.length === 0 ? (
        <p className='text-sm text-muted-foreground'>{t('review.empty')}</p>
      ) : (
        <div className='space-y-4'>
          {pending.map((order) => (
            <ReviewCard
              key={order.id}
              order={order}
              onDone={() => repairs.reload()}
              onError={setError}
            />
          ))}
        </div>
      )}
      {error ? (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      ) : null}
    </PageContainer>
  );
}

function ReviewCard(props: {
  readonly order: RepairOrder;
  readonly onDone: () => void;
  readonly onError: (message: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [remark, setRemark] = useState('');
  const [busy, setBusy] = useState(false);

  async function decide(decision: 'close' | 'return'): Promise<void> {
    setBusy(true);
    props.onError('');
    try {
      await reviewRepair(api, props.order.id, decision, remark);
      props.onDone();
    } catch (cause) {
      props.onError(messageOf(cause, t('review.actionFailed')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className='flex flex-row items-start justify-between space-y-0'>
        <div>
          <CardTitle className='text-base'>
            <Link
              to={`/repairs/${props.order.id}`}
              className='text-primary hover:underline'
            >
              {props.order.code}
            </Link>
          </CardTitle>
          <p className='mt-1 text-sm text-muted-foreground'>
            {props.order.equipmentCode} {props.order.equipmentName} ·{' '}
            {props.order.sourceTitle} · {t('repairs.assignee')}:{' '}
            {props.order.assigneeName ?? t('repairs.unassigned')}
          </p>
          <p className='mt-1 text-xs text-muted-foreground'>
            {formatDateTime(props.order.createdAt)}
          </p>
        </div>
        <span className='flex items-center gap-2'>
          <PriorityBadge priority={props.order.priority} />
          <RepairStatusBadge status={props.order.status} />
        </span>
      </CardHeader>
      <CardContent className='space-y-3'>
        <div className='space-y-1'>
          <Label htmlFor={`review-${props.order.id}`}>
            {t('repairs.reviewRemark')}
          </Label>
          <Textarea
            id={`review-${props.order.id}`}
            value={remark}
            onChange={(event) => setRemark(event.target.value)}
            placeholder={t('repairs.reviewRemarkPlaceholder')}
          />
        </div>
        <div className='flex gap-2'>
          <Button disabled={busy} onClick={() => void decide('close')}>
            {t('repairs.close')}
          </Button>
          <Button
            variant='outline'
            disabled={busy}
            onClick={() => void decide('return')}
          >
            {t('repairs.return')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function messageOf(cause: unknown, fallback: string): string {
  const payload = cause as {
    payload?: { message?: unknown };
    message?: unknown;
  };
  if (typeof payload?.payload?.message === 'string') {
    return payload.payload.message;
  }
  if (cause instanceof Error && cause.message) return cause.message;
  return fallback;
}
