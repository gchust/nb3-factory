import { useTranslation } from '@nocobase/i18n/client';
import { useCan, useGetIdentity } from '@refinedev/core';
import { ArrowLeft } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { ExpenseStatusBadge } from '@/components/expense/status-badge';
import { ReceiptUploadForm } from '@/components/expense/receipt-upload-form';
import { Loading } from '@/components/loading';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  useExpenseApi,
  type ExpenseClaimDetail,
  type ExpenseReceipt,
} from '@/lib/expense-api';
import {
  CLAIM_TYPE_KEYS,
  RECEIPT_TYPE_KEYS,
  formatAmount,
  formatDate,
  formatFileSize,
  messageOf,
  receiptContentUrl,
} from '@/lib/expense-display';

export default function ExpenseClaimDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useExpenseApi();
  const navigate = useNavigate();
  const params = useParams();
  const claimId = Number(params.id);
  const { data: identity } = useGetIdentity<{ id: string }>();
  const { data: canApprove } = useCan({
    resource: 'expense-approve',
    action: 'access',
  });
  const { data: canPay } = useCan({
    resource: 'expense-pay',
    action: 'access',
  });

  const [claim, setClaim] = useState<ExpenseClaimDetail>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const validClaimId = Number.isSafeInteger(claimId) && claimId > 0;

  const reload = useCallback(async (): Promise<void> => {
    if (!validClaimId) return;
    try {
      setError('');
      setClaim(await api.getClaim(claimId));
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setLoading(false);
    }
  }, [api, claimId, validClaimId]);

  useEffect(() => {
    if (!validClaimId) return;
    let active = true;
    api.getClaim(claimId).then(
      (data) => {
        if (!active) return;
        setClaim(data);
        setError('');
        setLoading(false);
      },
      (cause: unknown) => {
        if (!active) return;
        setError(messageOf(cause));
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [api, claimId, validClaimId]);

  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      await action();
      await reload();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Cancelling removes the record this page shows, so it must not reload it afterwards: the re-read would 404 on
   * a claim that no longer exists. It leaves the page instead.
   */
  const cancelClaim = async (): Promise<void> => {
    if (!claim) return;
    setBusy(true);
    setError('');
    try {
      await api.deleteClaim(claim.id);
      await navigate('/expense/claims');
    } catch (cause) {
      setError(messageOf(cause));
      setBusy(false);
    }
  };

  if (!validClaimId) {
    return (
      <section className='mx-auto w-full max-w-4xl space-y-4 px-6 py-8'>
        <Alert variant='destructive'>
          <AlertDescription>{t('expense.claims.notFound')}</AlertDescription>
        </Alert>
        <Button
          variant='outline'
          // The render target is a link, so the button must not claim native button semantics.
          nativeButton={false}
          render={<Link to='/expense/claims' />}
        >
          {t('expense.claims.backToList')}
        </Button>
      </section>
    );
  }

  if (loading) {
    return (
      <section className='mx-auto w-full max-w-4xl px-6 py-8'>
        <Loading label={t('expense.common.loading')} />
      </section>
    );
  }

  if (!claim) {
    return (
      <section className='mx-auto w-full max-w-4xl space-y-4 px-6 py-8'>
        <Alert variant='destructive'>
          <AlertDescription>
            {error || t('expense.claims.notFound')}
          </AlertDescription>
        </Alert>
        <Button
          variant='outline'
          // The render target is a link, so the button must not claim native button semantics.
          nativeButton={false}
          render={<Link to='/expense/claims' />}
        >
          {t('expense.claims.backToList')}
        </Button>
      </section>
    );
  }

  const isOwner = identity?.id === claim.applicantId;
  const isDraft = claim.status === 'draft';

  return (
    <section className='mx-auto w-full max-w-4xl space-y-6 px-6 py-8'>
      <header className='flex flex-wrap items-start justify-between gap-4'>
        <div className='space-y-2'>
          <Button
            variant='ghost'
            size='sm'
            // The render target is a link, so the button must not claim native button semantics.
            nativeButton={false}
            render={<Link to='/expense/claims' />}
          >
            <ArrowLeft aria-hidden='true' />
            {t('expense.claims.backToList')}
          </Button>
          <div className='flex items-center gap-3'>
            <h1 className='font-heading text-2xl font-semibold tracking-tight'>
              {claim.number}
            </h1>
            <ExpenseStatusBadge status={claim.status} />
          </div>
        </div>
        <div className='flex flex-wrap gap-2'>
          {isDraft && isOwner ? (
            <>
              <Button
                disabled={busy}
                onClick={() => void run(() => api.submitClaim(claim.id))}
              >
                {t('expense.claims.submit')}
              </Button>
              <Button
                variant='destructive'
                disabled={busy}
                onClick={() => void cancelClaim()}
              >
                {t('expense.claims.cancel')}
              </Button>
            </>
          ) : null}
          {claim.status === 'pending' && canApprove?.can ? (
            <>
              <Button
                disabled={busy}
                onClick={() => void run(() => api.approveClaim(claim.id))}
              >
                {t('expense.claims.approve')}
              </Button>
              <Button
                variant='destructive'
                disabled={busy}
                onClick={() => {
                  setRejectReason('');
                  setRejectOpen(true);
                }}
              >
                {t('expense.claims.reject')}
              </Button>
            </>
          ) : null}
          {claim.status === 'approved' && canPay?.can ? (
            <Button
              disabled={busy}
              onClick={() => void run(() => api.payClaim(claim.id))}
            >
              {t('expense.claims.markPaid')}
            </Button>
          ) : null}
        </div>
      </header>

      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className='grid gap-4 md:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>{t('expense.claims.info')}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className='grid grid-cols-2 gap-x-4 gap-y-2 text-sm'>
              <Description term={t('expense.fields.applicant')}>
                {claim.applicantName}
              </Description>
              <Description term={t('expense.fields.department')}>
                {claim.departmentName}
              </Description>
              <Description term={t('expense.fields.type')}>
                {t(CLAIM_TYPE_KEYS[claim.type] ?? 'expense.type.travel')}
              </Description>
              <Description term={t('expense.fields.appliedAt')}>
                {formatDate(claim.appliedAt)}
              </Description>
              <Description
                term={t('expense.fields.reason')}
                className='col-span-2'
              >
                {claim.reason}
              </Description>
              {claim.status === 'rejected' && claim.rejectReason ? (
                <Description
                  term={t('expense.fields.rejectReason')}
                  className='col-span-2 text-destructive'
                >
                  {claim.rejectReason}
                </Description>
              ) : null}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('expense.claims.summary')}</CardTitle>
          </CardHeader>
          <CardContent className='space-y-2'>
            {/* Read-only on purpose: the total is the sum of the receipts and is never typed in. */}
            <div className='rounded-lg bg-muted/50 px-4 py-3'>
              <div className='text-xs text-muted-foreground'>
                {t('expense.fields.amount')}
              </div>
              <div
                className='font-heading text-2xl font-semibold tabular-nums'
                data-testid='claim-total-amount'
              >
                {formatAmount(claim.totalAmount)}
              </div>
            </div>
            <div className='flex items-center justify-between text-sm'>
              <span className='text-muted-foreground'>
                {t('expense.fields.receiptCount')}
              </span>
              <span className='tabular-nums' data-testid='claim-receipt-count'>
                {claim.receiptCount}
              </span>
            </div>
            <p className='text-xs text-muted-foreground'>
              {t('expense.claims.amountIsDerived')}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('expense.receipts.title')}</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          {claim.receipts.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('expense.receipts.empty')}
            </p>
          ) : (
            <div className='rounded-xl ring-1 ring-foreground/10'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('expense.fields.receiptType')}</TableHead>
                    <TableHead className='text-right'>
                      {t('expense.fields.amount')}
                    </TableHead>
                    <TableHead>{t('expense.fields.invoiceDate')}</TableHead>
                    <TableHead>{t('expense.fields.file')}</TableHead>
                    <TableHead className='text-right'>
                      {t('expense.common.actions')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {claim.receipts.map((receipt) => (
                    <TableRow key={receipt.id}>
                      <TableCell>
                        {t(
                          RECEIPT_TYPE_KEYS[receipt.receiptType] ??
                            'expense.receiptType.other',
                        )}
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>
                        {formatAmount(receipt.amount)}
                      </TableCell>
                      <TableCell>{formatDate(receipt.invoiceDate)}</TableCell>
                      <TableCell>
                        <span
                          className='block max-w-56 truncate'
                          title={receipt.filename}
                        >
                          {receipt.filename}
                        </span>
                        <span className='text-xs text-muted-foreground'>
                          {formatFileSize(receipt.size)}
                        </span>
                      </TableCell>
                      <TableCell className='text-right'>
                        <div className='flex justify-end gap-1'>
                          <ReceiptDownload receipt={receipt} />
                          {isDraft && isOwner ? (
                            <Button
                              variant='ghost'
                              size='sm'
                              disabled={busy}
                              onClick={() =>
                                void run(() =>
                                  api.deleteReceipt(claim.id, receipt.id),
                                )
                              }
                            >
                              {t('expense.receipts.remove')}
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {isDraft && isOwner ? (
            <div className='space-y-2 border-t border-border pt-4'>
              <h3 className='font-heading text-sm font-medium'>
                {t('expense.receipts.addTitle')}
              </h3>
              <ReceiptUploadForm
                claimId={claim.id}
                onAdded={() => void reload()}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>{t('expense.claims.rejectTitle')}</DialogTitle>
          </DialogHeader>
          <div className='space-y-1.5'>
            <Label htmlFor='reject-reason'>
              {t('expense.fields.rejectReason')}
            </Label>
            <Textarea
              id='reject-reason'
              rows={3}
              value={rejectReason}
              onChange={(event) => setRejectReason(event.currentTarget.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              type='button'
              onClick={() => setRejectOpen(false)}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              variant='destructive'
              type='button'
              disabled={busy || rejectReason.trim().length === 0}
              onClick={() =>
                void run(() =>
                  api.rejectClaim(claim.id, rejectReason.trim()),
                ).then(() => setRejectOpen(false))
              }
            >
              {t('expense.claims.reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ReceiptDownload({
  receipt,
}: {
  readonly receipt: ExpenseReceipt;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Button
      variant='outline'
      size='sm'
      // The render target is a link, so the button must not claim native button semantics.
      nativeButton={false}
      render={
        <a
          href={receiptContentUrl(receipt)}
          download={receipt.filename}
          rel='noopener'
        />
      }
    >
      {t('expense.receipts.download')}
    </Button>
  );
}

function Description({
  term,
  children,
  className,
}: {
  readonly term: string;
  readonly children: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <div className={className}>
      <dt className='text-xs text-muted-foreground'>{term}</dt>
      <dd className='break-words'>{children}</dd>
    </div>
  );
}
