import { apiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { CheckIcon, DownloadIcon, XIcon } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loading } from '@/components/loading';
import { cn } from '@/lib/utils';
import {
  errorMessage,
  formatDate,
  formatMoney,
  statusBadgeClass,
} from '@/pages/expense-claims/shared';

interface ExpenseClaimItemView {
  readonly id: string;
  readonly itemName: string;
  readonly amount: number;
  readonly note: string | null;
}

interface ExpenseClaimAttachmentView {
  readonly id: string;
  readonly filename: string;
  readonly size: number;
  readonly contentUrl: string;
}

interface ExpenseClaimDetailView {
  readonly id: string;
  readonly claimNumber: string;
  readonly applicantName: string;
  readonly expenseType: string;
  readonly expenseDate: string;
  readonly totalAmount: number;
  readonly description: string | null;
  readonly status: string;
  readonly reviewerName: string | null;
  readonly reviewedAt: Date | string | null;
  readonly rejectReason: string | null;
  readonly createdAt: Date | string;
  readonly isFinance: boolean;
  readonly items: readonly ExpenseClaimItemView[];
  readonly attachments: readonly ExpenseClaimAttachmentView[];
}

export default function ExpenseClaimDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useService(apiClientToken);
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [claim, setClaim] = useState<ExpenseClaimDetailView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchDetail =
    useCallback(async (): Promise<ExpenseClaimDetailView | null> => {
      if (!id) return null;
      const { data } = await api.request<{
        data: ExpenseClaimDetailView | null;
      }>({
        path: `/expense-claims/${id}`,
        method: 'GET',
      });
      return data;
    }, [api, id]);

  const load = useCallback(async (): Promise<void> => {
    try {
      const data = await fetchDetail();
      if (data === null) {
        setClaim(null);
        setError(t('expenseClaims.notFound'));
        return;
      }
      setClaim(data);
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, t('expenseClaims.loadFailed')));
    }
  }, [fetchDetail, t]);

  useEffect(() => {
    let cancelled = false;
    fetchDetail()
      .then((data) => {
        if (cancelled) return;
        if (data === null) {
          setClaim(null);
          setError(t('expenseClaims.notFound'));
          return;
        }
        setClaim(data);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(errorMessage(cause, t('expenseClaims.loadFailed')));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fetchDetail, t]);

  if (error && claim === null) {
    return (
      <section className='mx-auto w-full max-w-3xl space-y-6 px-6 py-10'>
        <p className='text-sm text-destructive'>{error}</p>
        <Button
          variant='outline'
          onClick={() => void navigate('/expense-claims')}
        >
          {t('expenseClaims.backToClaims')}
        </Button>
      </section>
    );
  }

  if (claim === null) {
    return (
      <section className='mx-auto w-full max-w-3xl px-6 py-10'>
        <Loading label={t('expenseClaims.title')} />
      </section>
    );
  }

  const view = claim;
  const pending = view.status === 'pending';

  async function deleteAttachment(attachmentId: string) {
    setWorking(true);
    setNotice(null);
    setError(null);
    try {
      await api.request({
        path: `/expense-claims/${view.id}/attachments/${attachmentId}`,
        method: 'DELETE',
      });
      setNotice(t('expenseClaims.deletedSuccess'));
      void load();
    } catch (cause) {
      setError(errorMessage(cause, t('expenseClaims.deleteFailed')));
    } finally {
      setWorking(false);
    }
  }

  async function submitReview(action: 'approve' | 'reject') {
    if (action === 'reject' && rejectReason.trim() === '') {
      setError(t('expenseClaims.rejectHint'));
      return;
    }
    setWorking(true);
    setError(null);
    setNotice(null);
    try {
      await api.request({
        path: `/expense-claims/${view.id}/review`,
        method: 'POST',
        json: {
          action,
          reason: action === 'reject' ? rejectReason.trim() : null,
        },
      });
      setNotice(t('expenseClaims.reviewSuccess'));
      setRejecting(false);
      setRejectReason('');
      void load();
    } catch (cause) {
      setError(errorMessage(cause, t('expenseClaims.reviewFailed')));
    } finally {
      setWorking(false);
    }
  }

  const canManage = view.isFinance && pending;

  return (
    <section className='mx-auto w-full max-w-3xl space-y-6 px-6 py-10'>
      <header className='space-y-1'>
        <Link
          to='/expense-claims'
          className='text-sm text-muted-foreground hover:text-foreground'
        >
          ← {t('expenseClaims.backToClaims')}
        </Link>
        <div className='flex flex-wrap items-center gap-3'>
          <h1 className='font-heading text-2xl font-semibold tracking-tight'>
            {view.claimNumber}
          </h1>
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
              statusBadgeClass(view.status),
            )}
          >
            {t(`expenseClaims.statuses.${view.status}`)}
          </span>
        </div>
      </header>

      {notice && <p className='text-sm text-emerald-600'>{notice}</p>}
      {error && <p className='text-sm text-destructive'>{error}</p>}

      <div className='grid gap-4 rounded-lg border border-border p-6 sm:grid-cols-2'>
        <div className='space-y-1'>
          <p className='text-xs text-muted-foreground'>
            {t('expenseClaims.applicant')}
          </p>
          <p className='text-sm font-medium'>{view.applicantName}</p>
        </div>
        <div className='space-y-1'>
          <p className='text-xs text-muted-foreground'>
            {t('expenseClaims.expenseType')}
          </p>
          <p className='text-sm font-medium'>
            {t(`expenseClaims.types.${view.expenseType}`)}
          </p>
        </div>
        <div className='space-y-1'>
          <p className='text-xs text-muted-foreground'>
            {t('expenseClaims.expenseDate')}
          </p>
          <p className='text-sm font-medium'>{view.expenseDate}</p>
        </div>
        <div className='space-y-1'>
          <p className='text-xs text-muted-foreground'>
            {t('expenseClaims.totalAmount')}
          </p>
          <p className='text-sm font-semibold'>
            {formatMoney(view.totalAmount)}
          </p>
        </div>
        <div className='space-y-1 sm:col-span-2'>
          <p className='text-xs text-muted-foreground'>
            {t('expenseClaims.description')}
          </p>
          <p className='text-sm'>{view.description ?? '—'}</p>
        </div>
        <div className='space-y-1'>
          <p className='text-xs text-muted-foreground'>
            {t('expenseClaims.createdAt')}
          </p>
          <p className='text-sm'>{formatDate(view.createdAt)}</p>
        </div>
        <div className='space-y-1'>
          <p className='text-xs text-muted-foreground'>
            {t('expenseClaims.reviewer')}
          </p>
          <p className='text-sm'>{view.reviewerName ?? '—'}</p>
        </div>
        {view.reviewedAt !== null && (
          <div className='space-y-1'>
            <p className='text-xs text-muted-foreground'>
              {t('expenseClaims.reviewedAt')}
            </p>
            <p className='text-sm'>{formatDate(view.reviewedAt)}</p>
          </div>
        )}
        {view.rejectReason !== null && (
          <div className='space-y-1 sm:col-span-2'>
            <p className='text-xs text-muted-foreground'>
              {t('expenseClaims.rejectReason')}
            </p>
            <p className='text-sm'>{view.rejectReason}</p>
          </div>
        )}
      </div>

      <div className='space-y-3'>
        <h2 className='font-heading text-lg font-semibold'>
          {t('expenseClaims.items')}
        </h2>
        <div className='overflow-x-auto rounded-lg border border-border'>
          <table className='w-full border-collapse text-sm'>
            <thead>
              <tr className='border-b border-border'>
                <th className='px-4 py-3 text-left font-medium text-muted-foreground'>
                  {t('expenseClaims.itemName')}
                </th>
                <th className='px-4 py-3 text-right font-medium text-muted-foreground'>
                  {t('expenseClaims.amount')}
                </th>
                <th className='px-4 py-3 text-left font-medium text-muted-foreground'>
                  {t('expenseClaims.note')}
                </th>
              </tr>
            </thead>
            <tbody>
              {view.items.map((item) => (
                <tr
                  key={item.id}
                  className='border-b border-border last:border-0'
                >
                  <td className='px-4 py-3'>{item.itemName}</td>
                  <td className='px-4 py-3 text-right tabular-nums'>
                    {formatMoney(item.amount)}
                  </td>
                  <td className='px-4 py-3'>{item.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className='space-y-3'>
        <h2 className='font-heading text-lg font-semibold'>
          {t('expenseClaims.attachments')}
        </h2>
        {view.attachments.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('expenseClaims.noAttachments')}
          </p>
        ) : (
          <ul className='space-y-2'>
            {view.attachments.map((attachment) => (
              <li
                key={attachment.id}
                className='flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-2 text-sm'
              >
                <a
                  href={attachment.contentUrl}
                  download={attachment.filename}
                  className='flex min-w-0 items-center gap-2 text-foreground hover:text-primary'
                >
                  <DownloadIcon
                    className='size-4 shrink-0'
                    aria-hidden='true'
                  />
                  <span className='truncate'>{attachment.filename}</span>
                </a>
                <span className='shrink-0 text-xs text-muted-foreground'>
                  {(attachment.size / 1024).toFixed(1)} KB
                </span>
                {pending && (
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    disabled={working}
                    aria-label={t('expenseClaims.removeAttachment')}
                    onClick={() => void deleteAttachment(attachment.id)}
                  >
                    <XIcon className='size-4' aria-hidden='true' />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canManage && (
        <div className='space-y-3 rounded-lg border border-border p-4'>
          <div className='flex gap-3'>
            <Button
              type='button'
              variant='outline'
              disabled={working}
              onClick={() => void submitReview('approve')}
            >
              <CheckIcon className='size-4' aria-hidden='true' />
              {t('expenseClaims.approve')}
            </Button>
            <Button
              type='button'
              variant='outline'
              disabled={working}
              onClick={() => {
                setRejecting((prev) => !prev);
                setError(null);
              }}
            >
              {t('expenseClaims.reject')}
            </Button>
          </div>
          {rejecting && (
            <div className='space-y-2'>
              <Label htmlFor='reject-reason'>
                {t('expenseClaims.rejectReason')}
              </Label>
              <div className='flex flex-wrap gap-2'>
                <Input
                  id='reject-reason'
                  value={rejectReason}
                  onChange={(event) => setRejectReason(event.target.value)}
                />
                <Button
                  type='button'
                  disabled={working}
                  onClick={() => void submitReview('reject')}
                >
                  {t('expenseClaims.confirmReject')}
                </Button>
                <Button
                  type='button'
                  variant='ghost'
                  disabled={working}
                  onClick={() => {
                    setRejecting(false);
                    setRejectReason('');
                    setError(null);
                  }}
                >
                  {t('actions.cancel')}
                </Button>
              </div>
              <p className='text-xs text-muted-foreground'>
                {t('expenseClaims.rejectHint')}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
