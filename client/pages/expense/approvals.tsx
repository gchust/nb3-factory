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
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import type { ClaimRecord } from '@/lib/expense-api';

export default function ApprovalsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useExpenseApi();
  const navigate = useNavigate();
  const [claims, setClaims] = useState<readonly ClaimRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<ClaimRecord>();
  const [rejectReason, setRejectReason] = useState('');

  async function load(): Promise<void> {
    try {
      setClaims(await api.approvals());
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
      .approvals()
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
          {t('expense.approvals.title')}
        </h1>
        <p className='text-sm text-muted-foreground'>
          {t('expense.approvals.subtitle')}
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
          empty={t('expense.approvals.empty')}
          renderActions={(claim) => (
            <>
              {claim.capabilities.canApprove && (
                <Button
                  size='sm'
                  disabled={busy}
                  onClick={() => void run(() => api.approve(claim.id))}
                >
                  {t('expense.action.approve')}
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
            <Label htmlFor='approval-reject-reason'>
              {t('expense.detail.rejectReason')}
            </Label>
            <Textarea
              id='approval-reject-reason'
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
