import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router';

import { StatusBadge } from '@/components/expense/claim-widgets.js';
import { useExpenseLabels } from '@/components/expense/labels.js';
import { useExpenseApi } from '@/components/expense/use-api.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { attachmentHref, type ClaimRecord } from '@/lib/expense-api';

export default function ClaimDetailPage(): ReactElement {
  const { t } = useTranslation();
  const labels = useExpenseLabels();
  const api = useExpenseApi();
  const navigate = useNavigate();
  const { id } = useParams();
  const [claim, setClaim] = useState<ClaimRecord>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [payOpen, setPayOpen] = useState(false);
  const [paymentDate, setPaymentDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [busy, setBusy] = useState(false);

  async function load(): Promise<void> {
    try {
      const row = await api.claim(Number(id));
      setClaim(row);
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
      .claim(Number(id))
      .then((row) => {
        if (active) setClaim(row);
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
  }, [api, id, t]);

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

  if (loading && !claim) return <Spinner />;
  if (!claim) {
    return (
      <section className='space-y-4 p-6'>
        <p role='alert' className='text-sm text-destructive'>
          {error || t('expense.error.load')}
        </p>
        <Button
          variant='outline'
          onClick={() => {
            void navigate('/expenses/claims');
          }}
        >
          {t('expense.detail.back')}
        </Button>
      </section>
    );
  }

  const capabilities = claim.capabilities;

  return (
    <section className='space-y-6 p-6'>
      <header className='flex flex-wrap items-center justify-between gap-3'>
        <div className='space-y-1'>
          <div className='flex items-center gap-3'>
            <h1 className='font-heading text-2xl font-semibold'>
              {claim.number}
            </h1>
            <StatusBadge status={claim.status} />
          </div>
          <p className='text-sm text-muted-foreground'>
            {claim.applicantName} ·{' '}
            {claim.departmentName ?? t('expense.unassignedDepartment')} ·{' '}
            {claim.expenseDate}
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          {capabilities.canOpenEditor && (
            <Button
              variant='outline'
              onClick={() => {
                void navigate(`/expenses/claims/${claim.id}/edit`);
              }}
              disabled={busy}
            >
              {t('expense.detail.edit')}
            </Button>
          )}
          {capabilities.canApprove && (
            <Button
              onClick={() => void run(() => api.approve(claim.id))}
              disabled={busy}
            >
              {t('expense.action.approve')}
            </Button>
          )}
          {capabilities.canReview && (
            <Button
              onClick={() => void run(() => api.review(claim.id))}
              disabled={busy}
            >
              {t('expense.action.review')}
            </Button>
          )}
          {capabilities.canPay && (
            <Button
              onClick={() => {
                setError('');
                setPayOpen(true);
              }}
              disabled={busy}
            >
              {t('expense.action.pay')}
            </Button>
          )}
          {capabilities.canReject && (
            <Button
              variant='destructive'
              onClick={() => {
                setError('');
                setRejectOpen(true);
              }}
              disabled={busy}
            >
              {t('expense.action.reject')}
            </Button>
          )}
          {capabilities.canDelete && (
            <Button
              variant='ghost'
              disabled={busy}
              onClick={() => {
                if (window.confirm(t('expense.detail.deleteConfirm'))) {
                  void run(async () => {
                    await api.deleteClaim(claim.id);
                    await navigate('/expenses/claims');
                  });
                }
              }}
            >
              {t('expense.detail.delete')}
            </Button>
          )}
        </div>
      </header>

      {error && (
        <p
          role='alert'
          className='rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'
        >
          {error}
        </p>
      )}

      {claim.status === 'rejected' && claim.rejectReason && (
        <p className='rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'>
          {t('expense.detail.rejectReason')}: {claim.rejectReason}
        </p>
      )}
      {claim.paymentDate && (
        <p className='rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm'>
          {t('expense.detail.paymentDate')}: {claim.paymentDate}
        </p>
      )}
      {claim.loanId && (
        <p className='rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm'>
          {t('expense.detail.settledLoan')}:{' '}
          {claim.loanSummary ?? `#${claim.loanId}`}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('expense.field.reason')}</CardTitle>
        </CardHeader>
        <CardContent className='space-y-1 text-sm'>
          <p className='whitespace-pre-wrap'>{claim.reason}</p>
          <p className='font-medium'>
            {t('expense.form.total')}:{' '}
            <span className='font-mono'>{labels.money(claim.totalCents)}</span>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('expense.form.items')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('expense.field.category')}</TableHead>
                <TableHead className='text-right'>
                  {t('expense.field.amount')}
                </TableHead>
                <TableHead>{t('expense.field.remark')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {claim.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{labels.category(item.category)}</TableCell>
                  <TableCell className='text-right font-mono'>
                    {labels.money(item.amountCents)}
                  </TableCell>
                  <TableCell>{item.remark ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('expense.field.attachments')}</CardTitle>
        </CardHeader>
        <CardContent>
          {claim.attachments.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('expense.detail.noAttachments')}
            </p>
          ) : (
            <ul className='space-y-1 text-sm'>
              {claim.attachments.map((file) => (
                <li key={file.id}>
                  <a
                    href={attachmentHref(file)}
                    target='_blank'
                    rel='noreferrer'
                    className='text-primary underline-offset-4 hover:underline'
                  >
                    {file.filename}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('expense.action.reject')}</DialogTitle>
          </DialogHeader>
          <div className='space-y-2'>
            <Label htmlFor='reject-reason'>
              {t('expense.detail.rejectReason')}
            </Label>
            <Textarea
              id='reject-reason'
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
            <Button variant='outline' onClick={() => setRejectOpen(false)}>
              {t('actions.cancel')}
            </Button>
            <Button
              variant='destructive'
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api.reject(claim.id, rejectReason);
                  setRejectReason('');
                  setRejectOpen(false);
                })
              }
            >
              {t('expense.action.reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('expense.action.pay')}</DialogTitle>
          </DialogHeader>
          <div className='space-y-2'>
            <Label htmlFor='payment-date'>
              {t('expense.detail.paymentDate')}
            </Label>
            <Input
              id='payment-date'
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
            <Button variant='outline' onClick={() => setPayOpen(false)}>
              {t('actions.cancel')}
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api.pay(claim.id, paymentDate);
                  setPayOpen(false);
                })
              }
            >
              {t('expense.action.pay')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
