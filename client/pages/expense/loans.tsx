import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';

import { useExpenseApi } from '@/components/expense/use-api.js';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { formatMoney, yuanToCents, type LoanRecord } from '@/lib/expense-api';

export default function LoansPage(): ReactElement {
  const { t } = useTranslation();
  const api = useExpenseApi();
  const [loans, setLoans] = useState<readonly LoanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [loanDate, setLoanDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [purpose, setPurpose] = useState('');
  const [saving, setSaving] = useState(false);

  async function load(): Promise<void> {
    try {
      setLoans(await api.loans());
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
      .loans()
      .then((rows) => {
        if (active) setLoans(rows);
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

  async function create(): Promise<void> {
    setError('');
    const amountCents = yuanToCents(amount);
    if (amountCents === null) {
      setError(t('expense.form.amountInvalid'));
      return;
    }
    setSaving(true);
    try {
      await api.createLoan({ amountCents, loanDate, purpose: purpose.trim() });
      setAmount('');
      setPurpose('');
      setFormOpen(false);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t('expense.error.action'),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className='space-y-6 p-6'>
      <header className='flex items-center justify-between gap-4'>
        <div>
          <h1 className='font-heading text-2xl font-semibold'>
            {t('expense.loans.title')}
          </h1>
          <p className='text-sm text-muted-foreground'>
            {t('expense.loans.subtitle')}
          </p>
        </div>
        <Button onClick={() => setFormOpen((open) => !open)}>
          <PlusIcon />
          {t('expense.loans.new')}
        </Button>
      </header>

      {formOpen && (
        <Card>
          <CardHeader>
            <CardTitle>{t('expense.loans.new')}</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-4 sm:grid-cols-3'>
            <div className='space-y-2'>
              <Label htmlFor='loan-amount'>{t('expense.field.amount')}</Label>
              <Input
                id='loan-amount'
                type='number'
                min='0'
                step='0.01'
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='loan-date'>{t('expense.field.loanDate')}</Label>
              <Input
                id='loan-date'
                type='date'
                value={loanDate}
                onChange={(event) => setLoanDate(event.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='loan-purpose'>{t('expense.field.purpose')}</Label>
              <Input
                id='loan-purpose'
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
              />
            </div>
            <div className='sm:col-span-3'>
              <Button onClick={() => void create()} disabled={saving}>
                {t('actions.save')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      )}

      {loading ? (
        <Spinner />
      ) : loans.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t('expense.loans.empty')}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('expense.table.borrower')}</TableHead>
              <TableHead>{t('expense.field.loanDate')}</TableHead>
              <TableHead className='text-right'>
                {t('expense.field.amount')}
              </TableHead>
              <TableHead>{t('expense.field.purpose')}</TableHead>
              <TableHead>{t('expense.loans.settledLabel')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loans.map((loan) => (
              <TableRow key={loan.id}>
                <TableCell>{loan.borrowerName}</TableCell>
                <TableCell>{loan.loanDate}</TableCell>
                <TableCell className='text-right font-mono'>
                  {formatMoney(loan.amountCents)}
                </TableCell>
                <TableCell>{loan.purpose ?? '—'}</TableCell>
                <TableCell>
                  {loan.settled ? (
                    <Badge>
                      {t('expense.loans.settled')}
                      {loan.settledByClaimNumber
                        ? ` · ${loan.settledByClaimNumber}`
                        : ''}
                    </Badge>
                  ) : (
                    <Badge variant='secondary'>
                      {t('expense.loans.unsettled')}
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
