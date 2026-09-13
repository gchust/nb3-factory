import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router';

import { ClaimTable } from '@/components/expense/claim-widgets.js';
import { useExpenseApi } from '@/components/expense/use-api.js';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import type { ClaimRecord } from '@/lib/expense-api';

export default function PaymentsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useExpenseApi();
  const navigate = useNavigate();
  const [claims, setClaims] = useState<readonly ClaimRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [payTarget, setPayTarget] = useState<ClaimRecord>();
  const [paymentDate, setPaymentDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [rejectTarget, setRejectTarget] = useState<ClaimRecord>();
  const [rejectReason, setRejectReason] = useState('');

  async function load(): Promise<void> {
    try {
      setClaims(await api.payments());
      setError('');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t('expense.error.load'),
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    api
      .payments()
      .then((rows) => {
        if (active) setClaims(rows);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error ? cause.message : t('expense.error.load'),
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, t]);

  async function run(action: () => Promise<unknown>): Promise<void> {
    setBusy(true);
    setError('');
    try {
      await action();
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t('expense.error.action'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className='space-y-6 p-6'>
      <header>
        <h1 className='font-heading text-2xl font-semibold'>
          {t('expense.payments.title')}
        </h1>
        <p className='text-sm text-muted-foreground'>
          {t('expense.payments.subtitle')}
        </p>
      </header>

      {error && (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      )}

      {loading ? (
        <Spinner />
      ) : (
        <ClaimTable
          claims={claims}
          onOpen={(claim) => {
            void navigate(`/expenses/claims/${claim.id}`);
          }}
          empty={t('expense.payments.empty')}
          renderActions={(claim) => (
            <>
              {claim.capabilities.canReview && (
                <Button
                  size='sm'
                  variant='outline'
                  disabled={busy}
                  onClick={() => void run(() => api.review(claim.id))}
                >
                  {t('expense.action.review')}
                </Button>
              )}
              {claim.capabilities.canPay && (
                <Button
                  size='sm'
                  disabled={busy}
                  onClick={() => {
                    setError('');
                    setPayTarget(claim);
                    setPaymentDate(new Date().toISOString().slice(0, 10));
                  }}
                >
                  {t('expense.action.pay')}
                </Button>
              )}
              {claim.capabilities.canReject && (
                <Button
                  size='sm'
                  variant='destructive'
                  disabled={busy}
                  onClick={() => {
                    setError('');
                    setRejectTarget(claim);
                    setRejectReason('');
                  }}
                >
                  {t('expense.action.reject')}
                </Button>
              )}
            </>
          )}
        />
      )}

      <Dialog
        open={payTarget !== undefined}
        onOpenChange={(open) => {
          if (!open) setPayTarget(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('expense.action.pay')} · {payTarget?.number}
            </DialogTitle>
          </DialogHeader>
          <div className='space-y-2'>
            <Label htmlFor='payment-queue-date'>
              {t('expense.detail.paymentDate')}
            </Label>
            <Input
              id='payment-queue-date'
              type='date'
              value={paymentDate}
              onChange={(event) => setPaymentDate(event.target.value)}
            />
          </div>
          {error && (
            <p role='alert' className='text-sm text-destructive'>
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant='outline' onClick={() => setPayTarget(undefined)}>
              {t('actions.cancel')}
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (payTarget) await api.pay(payTarget.id, paymentDate);
                  setPayTarget(undefined);
                })
              }
            >
              {t('expense.action.pay')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={rejectTarget !== undefined}
        onOpenChange={(open) => {
          if (!open) setRejectTarget(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('expense.action.reject')} · {rejectTarget?.number}
            </DialogTitle>
          </DialogHeader>
          <div className='space-y-2'>
            <Label htmlFor='payment-reject-reason'>
              {t('expense.detail.rejectReason')}
            </Label>
            <Textarea
              id='payment-reject-reason'
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
            />
          </div>
          {error && (
            <p role='alert' className='text-sm text-destructive'>
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setRejectTarget(undefined)}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              variant='destructive'
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (rejectTarget)
                    await api.reject(rejectTarget.id, rejectReason);
                  setRejectTarget(undefined);
                })
              }
            >
              {t('expense.action.reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
