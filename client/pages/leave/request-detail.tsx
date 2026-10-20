import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState } from 'react';
import { useLocation, useOutletContext, useParams } from 'react-router';

import { RouteDrawer } from '#components/route-drawer';
import { StatusBadge } from '#components/status-badge';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Skeleton } from '#components/ui/skeleton';
import { Textarea } from '#components/ui/textarea';
import { ConfirmAction, SettingsError } from '../settings/shared.js';
import { useLeaveResource } from './data.js';
import { dateRange, formatInstant } from './format.js';
import type { LeaveContext } from './index.js';
import type { LeaveDataResponse, LeaveStatus } from './types.js';

const DECISION = {
  resource: { type: 'settings', id: 'leave.approvals' },
  action: 'decide',
} as const;

function statusTone(status: LeaveStatus) {
  return status === 'pending'
    ? 'warning'
    : status === 'approved'
      ? 'success'
      : 'neutral';
}

function decisionError(error: unknown, t: (key: string) => string): string {
  if (error instanceof ApiClientError) {
    if (error.reason === 'LEAVE_REQUEST_NOT_PENDING') {
      return t('leave.detail.alreadyDecided');
    }
    if (error.reason === 'LEAVE_REQUEST_NOT_FOUND') {
      return t('leave.detail.missing');
    }
  }
  return t('leave.detail.decisionFailed');
}

export default function LeaveRequestDetail() {
  const { t, i18n } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const location = useLocation();
  const parent = useOutletContext<LeaveContext>();
  const { requestId = '' } = useParams();
  const resource = useLeaveResource<LeaveDataResponse>(
    `leaveRequests/${encodeURIComponent(requestId)}`,
    { enabled: requestId !== '' },
  );
  const request = resource.data?.data;
  const can = useCan(DECISION, { enabled: request != null }).can;
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [decisionErrorValue, setDecisionErrorValue] = useState<unknown>();

  const decide = async (status: 'approved' | 'rejected') => {
    setBusy(true);
    setDecisionErrorValue(undefined);
    try {
      await api.request({
        path: `leaveRequests/${encodeURIComponent(requestId)}/status`,
        method: 'PATCH',
        json: {
          status,
          ...(comment.trim() ? { comment: comment.trim() } : {}),
        },
      });
      resource.reload();
      parent.reload();
      setApproving(false);
      setRejecting(false);
      setComment('');
      toaster.show({
        type: 'success',
        title: t(
          status === 'approved'
            ? 'leave.detail.approvedToast'
            : 'leave.detail.rejectedToast',
        ),
      });
    } catch (error) {
      setDecisionErrorValue(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <RouteDrawer
      title={t('leave.detail.title')}
      description={request?.userName}
      closeTo={{ pathname: '/leave', search: location.search }}
    >
      {resource.loading && !request ? (
        <div className='flex flex-col gap-3'>
          <Skeleton className='h-8 w-40' />
          <Skeleton className='h-40 w-full' />
        </div>
      ) : resource.error != null ? (
        <SettingsError error={resource.error} retry={resource.reload} />
      ) : request ? (
        <div className='flex flex-col gap-6'>
          <div className='flex flex-wrap items-center gap-2'>
            <StatusBadge tone={statusTone(request.status)}>
              {t(`leave.status.${request.status}`)}
            </StatusBadge>
            <span className='text-sm text-muted-foreground'>
              {t(`leave.type.${request.type}`)} ·{' '}
              {t('leave.detail.days', { count: request.days })}
            </span>
          </div>
          <dl className='grid gap-4 text-sm sm:grid-cols-2'>
            <div>
              <dt className='text-muted-foreground'>
                {t('leave.detail.employee')}
              </dt>
              <dd className='mt-1 font-medium'>{request.userName}</dd>
            </div>
            <div>
              <dt className='text-muted-foreground'>
                {t('leave.detail.dates')}
              </dt>
              <dd className='mt-1'>
                {dateRange(request.startDate, request.endDate, i18n.language)}
              </dd>
            </div>
            <div>
              <dt className='text-muted-foreground'>
                {t('leave.detail.submitted')}
              </dt>
              <dd className='mt-1'>
                {formatInstant(request.submittedAt, i18n.language)}
              </dd>
            </div>
            <div>
              <dt className='text-muted-foreground'>
                {t('leave.detail.decided')}
              </dt>
              <dd className='mt-1'>
                {request.decidedAt
                  ? formatInstant(request.decidedAt, i18n.language)
                  : t('leave.detail.notDecided')}
              </dd>
            </div>
          </dl>
          <div>
            <h3 className='text-sm font-medium'>{t('leave.detail.reason')}</h3>
            <p className='mt-2 whitespace-pre-wrap text-sm leading-6'>
              {request.reason}
            </p>
          </div>
          {request.reviewerName && (
            <div className='rounded-lg bg-muted p-3 text-sm'>
              <p className='font-medium'>
                {t('leave.detail.reviewedBy', {
                  name: request.reviewerName,
                })}
              </p>
              {request.reviewComment && (
                <p className='mt-1 whitespace-pre-wrap text-muted-foreground'>
                  {request.reviewComment}
                </p>
              )}
            </div>
          )}
          {decisionErrorValue != null && (
            <Alert variant='destructive'>
              <AlertDescription>
                {decisionError(decisionErrorValue, t)}
              </AlertDescription>
            </Alert>
          )}
          {request.status === 'pending' && can && (
            <div className='flex flex-col gap-3 border-t pt-4'>
              <h3 className='text-sm font-medium'>
                {t('leave.detail.decision')}
              </h3>
              {!rejecting ? (
                <div className='flex flex-wrap gap-2'>
                  <Button disabled={busy} onClick={() => setApproving(true)}>
                    {t('leave.detail.approve')}
                  </Button>
                  <Button
                    variant='outline'
                    disabled={busy}
                    onClick={() => setRejecting(true)}
                  >
                    {t('leave.detail.reject')}
                  </Button>
                </div>
              ) : (
                <div className='flex flex-col gap-2'>
                  <Textarea
                    value={comment}
                    aria-label={t('leave.detail.comment')}
                    placeholder={t('leave.detail.commentPlaceholder')}
                    rows={3}
                    onChange={(event) => setComment(event.target.value)}
                  />
                  <div className='flex flex-wrap gap-2'>
                    <Button
                      variant='destructive'
                      disabled={busy}
                      onClick={() => void decide('rejected')}
                    >
                      {busy
                        ? t('leave.detail.deciding')
                        : t('leave.detail.confirmReject')}
                    </Button>
                    <Button
                      variant='outline'
                      disabled={busy}
                      onClick={() => {
                        setRejecting(false);
                        setComment('');
                      }}
                    >
                      {t('leave.form.cancel')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}
      <ConfirmAction
        open={approving}
        title={t('leave.detail.approveTitle')}
        description={t('leave.detail.approveDescription', {
          name: request?.userName ?? '',
        })}
        confirmLabel={t('leave.detail.approve')}
        busy={busy}
        onCancel={() => setApproving(false)}
        onConfirm={() => void decide('approved')}
      />
    </RouteDrawer>
  );
}
