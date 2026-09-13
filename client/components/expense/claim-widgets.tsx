import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement, ReactNode } from 'react';

import type { ClaimRecord, ExpenseStatus } from '@/lib/expense-api';

import { EXPENSE_CATEGORIES } from './categories.js';
import { useExpenseLabels } from './labels.js';

const STATUS_VARIANTS: Record<
  ExpenseStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending: 'secondary',
  approved: 'default',
  pending_payment: 'outline',
  paid: 'default',
  rejected: 'destructive',
};

export function StatusBadge({ status }: { status: string }): ReactElement {
  const labels = useExpenseLabels();
  return (
    <Badge variant={STATUS_VARIANTS[status as ExpenseStatus] ?? 'outline'}>
      {labels.status(status)}
    </Badge>
  );
}

export function CategoryOptions(): ReactElement {
  const labels = useExpenseLabels();
  return (
    <>
      {EXPENSE_CATEGORIES.map((category) => (
        <option key={category} value={category}>
          {labels.category(category)}
        </option>
      ))}
    </>
  );
}

export function ClaimTable({
  claims,
  showApplicant = true,
  renderActions,
  onOpen,
  empty,
}: {
  claims: readonly ClaimRecord[];
  showApplicant?: boolean;
  renderActions?: (claim: ClaimRecord) => ReactNode;
  onOpen?: (claim: ClaimRecord) => void;
  empty: string;
}): ReactElement {
  const { t } = useTranslation();
  const labels = useExpenseLabels();
  if (claims.length === 0) {
    return <p className='text-sm text-muted-foreground'>{empty}</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('expense.table.number')}</TableHead>
          {showApplicant && (
            <TableHead>{t('expense.table.applicant')}</TableHead>
          )}
          <TableHead>{t('expense.table.department')}</TableHead>
          <TableHead>{t('expense.table.date')}</TableHead>
          <TableHead className='text-right'>
            {t('expense.table.amount')}
          </TableHead>
          <TableHead>{t('expense.table.status')}</TableHead>
          {renderActions && (
            <TableHead className='text-right'>
              {t('expense.table.actions')}
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {claims.map((claim) => (
          <TableRow key={claim.id}>
            <TableCell>
              {onOpen ? (
                <button
                  type='button'
                  onClick={() => onOpen(claim)}
                  className='font-medium text-primary underline-offset-4 hover:underline'
                >
                  {claim.number}
                </button>
              ) : (
                <span className='font-medium'>{claim.number}</span>
              )}
            </TableCell>
            {showApplicant && <TableCell>{claim.applicantName}</TableCell>}
            <TableCell>
              {claim.departmentName ?? t('expense.unassignedDepartment')}
            </TableCell>
            <TableCell>{claim.expenseDate}</TableCell>
            <TableCell className='text-right font-mono'>
              {labels.money(claim.totalCents)}
            </TableCell>
            <TableCell>
              <StatusBadge status={claim.status} />
            </TableCell>
            {renderActions && (
              <TableCell className='text-right'>
                <div className='flex justify-end gap-2'>
                  {renderActions(claim)}
                </div>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
