import { useTranslation } from '@nocobase/i18n/client';
import { Plus } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router';

import { ClaimCreateDialog } from '@/components/expense/claim-create-dialog';
import { ExpenseStatusBadge } from '@/components/expense/status-badge';
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
import { useExpenseApi, type ExpenseClaim } from '@/lib/expense-api';
import {
  CLAIM_TYPE_KEYS,
  formatAmount,
  messageOf,
} from '@/lib/expense-display';

export default function ExpenseClaimsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useExpenseApi();
  const navigate = useNavigate();
  const [claims, setClaims] = useState<readonly ExpenseClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);

  const refresh = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    api.listClaims().then(
      (rows) => {
        if (!active) return;
        setClaims(rows);
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
  }, [api, version]);

  return (
    <section className='mx-auto w-full max-w-6xl space-y-6 px-6 py-8'>
      <header className='flex flex-wrap items-start justify-between gap-4'>
        <div className='space-y-1'>
          <h1 className='font-heading text-2xl font-semibold tracking-tight'>
            {t('expense.claims.title')}
          </h1>
          <p className='text-sm text-muted-foreground'>
            {t('expense.claims.description')}
          </p>
        </div>
        <Button type='button' onClick={() => setDialogOpen(true)}>
          <Plus aria-hidden='true' />
          {t('expense.claims.create')}
        </Button>
      </header>

      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <Loading label={t('expense.common.loading')} />
      ) : claims.length === 0 ? (
        <p className='rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground'>
          {t('expense.claims.empty')}
        </p>
      ) : (
        <div className='rounded-xl ring-1 ring-foreground/10'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('expense.fields.number')}</TableHead>
                <TableHead>{t('expense.fields.applicant')}</TableHead>
                <TableHead>{t('expense.fields.department')}</TableHead>
                <TableHead>{t('expense.fields.type')}</TableHead>
                <TableHead className='text-right'>
                  {t('expense.fields.amount')}
                </TableHead>
                <TableHead className='text-right'>
                  {t('expense.fields.receiptCount')}
                </TableHead>
                <TableHead>{t('expense.fields.status')}</TableHead>
                <TableHead className='text-right'>
                  {t('expense.common.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {claims.map((claim) => (
                <TableRow key={claim.id}>
                  <TableCell className='font-medium'>{claim.number}</TableCell>
                  <TableCell>{claim.applicantName}</TableCell>
                  <TableCell>{claim.departmentName}</TableCell>
                  <TableCell>
                    {t(CLAIM_TYPE_KEYS[claim.type] ?? 'expense.type.travel')}
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {formatAmount(claim.totalAmount)}
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {claim.receiptCount}
                  </TableCell>
                  <TableCell>
                    <ExpenseStatusBadge status={claim.status} />
                  </TableCell>
                  <TableCell className='text-right'>
                    <Button
                      variant='outline'
                      size='sm'
                      // The render target is a link, so the button must not claim native button semantics.
                      nativeButton={false}
                      render={<Link to={`/expense/claims/${claim.id}`} />}
                    >
                      {t('expense.common.view')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ClaimCreateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(claimId) => {
          refresh();
          void navigate(`/expense/claims/${claimId}`);
        }}
      />
    </section>
  );
}
