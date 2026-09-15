import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';

import { Loading } from '@/components/loading';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useExpenseApi, type ExpenseReceipt } from '@/lib/expense-api';
import {
  RECEIPT_TYPE_KEYS,
  formatAmount,
  formatDate,
  formatFileSize,
  receiptContentUrl,
} from '@/lib/expense-display';

export default function ExpenseReceiptsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useExpenseApi();
  const [receipts, setReceipts] = useState<readonly ExpenseReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.listReceipts().then(
      (rows) => {
        if (!active) return;
        setReceipts(rows);
        setError('');
        setLoading(false);
      },
      (cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [api]);

  return (
    <section className='mx-auto w-full max-w-6xl space-y-6 px-6 py-8'>
      <header className='space-y-1'>
        <h1 className='font-heading text-2xl font-semibold tracking-tight'>
          {t('expense.receipts.title')}
        </h1>
        <p className='text-sm text-muted-foreground'>
          {t('expense.receipts.description')}
        </p>
      </header>

      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <Loading label={t('expense.common.loading')} />
      ) : receipts.length === 0 ? (
        <p className='rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground'>
          {t('expense.receipts.empty')}
        </p>
      ) : (
        <div className='rounded-xl ring-1 ring-foreground/10'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('expense.fields.number')}</TableHead>
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
              {receipts.map((receipt) => (
                <TableRow key={receipt.id}>
                  <TableCell className='font-medium'>
                    {receipt.claimNumber ?? '—'}
                  </TableCell>
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
