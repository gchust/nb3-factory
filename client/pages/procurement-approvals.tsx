import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useState, type ReactElement } from 'react';

import {
  EmptyLine,
  ErrorLine,
  LoadingLine,
  ProcurementCard,
  ProcurementPage,
} from '@/components/procurement/page-shell';
import { StatusBadge } from '@/components/procurement/status-badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  formatMoney,
  messageOf,
  useLoaded,
  useProcurementApi,
} from '@/lib/procurement-api';

export default function ApprovalsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useProcurementApi();
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  const meLoader = useCallback(() => api.me(), [api]);
  const { data: me } = useLoaded(meLoader);
  const requestsLoader = useCallback(() => api.listRequests(), [api]);
  const {
    data: requests,
    loading,
    error: loadError,
    reload,
  } = useLoaded(requestsLoader);

  const pending = (requests ?? []).filter(
    (request) => request.status === 'pending',
  );

  const act = async (
    id: number,
    action: 'approve' | 'reject',
  ): Promise<void> => {
    setError(undefined);
    setMessage(undefined);
    try {
      if (action === 'approve') {
        await api.approveRequest(id);
        setMessage(t('procurement.approvals.approved'));
      } else {
        const reason = (reasons[id] ?? '').trim();
        if (!reason) {
          setError(t('procurement.approvals.reasonRequired'));
          return;
        }
        await api.rejectRequest(id, reason);
        setMessage(t('procurement.approvals.rejected'));
      }
      reload();
    } catch (cause) {
      setError(messageOf(cause));
    }
  };

  return (
    <ProcurementPage title={t('procurement.approvals.title')}>
      {me && !me.capabilities.canApprove ? (
        <ErrorLine message={t('procurement.denied')} />
      ) : null}

      <ProcurementCard title={t('procurement.approvals.pending')}>
        {loading ? <LoadingLine /> : null}
        {loadError ? <ErrorLine message={loadError} /> : null}
        {!loading && pending.length === 0 ? <EmptyLine /> : null}
        <div className='space-y-4'>
          {pending.map((request) => (
            <div
              key={request.id}
              className='space-y-3 rounded-lg border border-border p-4'
            >
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='space-y-1'>
                  <p className='font-medium'>
                    #{request.id} ·{' '}
                    {request.applicantName ?? request.applicantId}
                  </p>
                  <p className='text-sm text-muted-foreground'>
                    {request.department ?? '—'} · {request.description ?? '—'}
                  </p>
                </div>
                <div className='flex items-center gap-3'>
                  <span className='tabular-nums text-sm font-medium'>
                    {formatMoney(request.totalAmount)}
                  </span>
                  <StatusBadge kind='request' status={request.status} />
                </div>
              </div>
              <div className='space-y-2'>
                <Label htmlFor={`reason-${request.id}`}>
                  {t('procurement.approvals.rejectReason')}
                </Label>
                <Textarea
                  id={`reason-${request.id}`}
                  placeholder={t(
                    'procurement.approvals.rejectReasonPlaceholder',
                  )}
                  value={reasons[request.id] ?? ''}
                  onChange={(event) =>
                    setReasons({ ...reasons, [request.id]: event.target.value })
                  }
                />
              </div>
              <div className='flex gap-2'>
                <Button onClick={() => void act(request.id, 'approve')}>
                  {t('procurement.approvals.approve')}
                </Button>
                <Button
                  variant='destructive'
                  onClick={() => void act(request.id, 'reject')}
                >
                  {t('procurement.approvals.reject')}
                </Button>
              </div>
            </div>
          ))}
        </div>
        {message ? (
          <p className='text-sm text-muted-foreground'>{message}</p>
        ) : null}
        {error ? <ErrorLine message={error} /> : null}
      </ProcurementCard>
    </ProcurementPage>
  );
}
