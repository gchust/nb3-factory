import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { Link } from 'react-router';

import { Loading } from '@/components/loading';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import {
  fetchExpenseReports,
  type ExpenseReportSummary,
  type ExpenseScope,
} from './api.js';
import {
  STATUS_ORDER,
  formatAmount,
  formatDate,
  statusLabelKey,
} from './constants.js';
import { expenseErrorMessage } from './errors.js';
import { useExpenseInvalidation } from './refresh.js';
import { EmptyState, Notice, StatusBadge } from './shared.jsx';

export interface ExpenseCategoryOption {
  readonly id: string;
  readonly name: string;
}

export function ReportList({
  scope,
  categories,
  showEmployee = false,
  defaultStatus = 'all',
  renderActions,
  emptyTitle,
  emptyDescription,
  viewLabelKey = 'expenses.actions.view',
}: {
  readonly scope: ExpenseScope;
  readonly categories: readonly ExpenseCategoryOption[];
  readonly showEmployee?: boolean;
  readonly defaultStatus?: string;
  readonly renderActions?: (report: ExpenseReportSummary) => ReactNode;
  readonly emptyTitle?: string;
  readonly emptyDescription?: string;
  readonly viewLabelKey?: string;
}): ReactElement {
  const api = useApiClient();
  const { t } = useTranslation();
  const [reports, setReports] = useState<readonly ExpenseReportSummary[]>([]);
  const [allowed, setAllowed] = useState(true);
  const [status, setStatus] = useState(defaultStatus);
  const [categoryId, setCategoryId] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const invalidation = useExpenseInvalidation();

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await fetchExpenseReports(api, {
          scope,
          status,
          categoryId,
          search,
        });
        if (controller.signal.aborted) return;
        setReports(result.data);
        setAllowed(result.allowed);
        setError(undefined);
      } catch (caught) {
        if (!controller.signal.aborted) {
          setError(expenseErrorMessage(caught, t('expenses.loadFailed'), t));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [api, scope, status, categoryId, search, invalidation, t]);

  const statusOptions = [
    { value: 'all', label: t('expenses.filter.allStatuses') },
    ...STATUS_ORDER.map((value) => ({
      value,
      label: t(statusLabelKey(value)),
    })),
  ];
  const categoryOptions = [
    { value: 'all', label: t('expenses.filter.allCategories') },
    ...categories.map((category) => ({
      value: category.id,
      label: category.name,
    })),
  ];

  return (
    <div className='space-y-4'>
      <form
        className='flex flex-wrap items-end gap-3'
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(searchInput.trim());
        }}
      >
        <div className='min-w-56 flex-1'>
          <Input
            aria-label={t('expenses.filter.search')}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={t('expenses.filter.searchPlaceholder')}
            value={searchInput}
          />
        </div>
        <div className='w-40'>
          <Select
            items={statusOptions}
            onValueChange={(value) =>
              setStatus(typeof value === 'string' ? value : 'all')
            }
            value={status}
          >
            <SelectTrigger className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className='w-40'>
          <Select
            items={categoryOptions}
            onValueChange={(value) =>
              setCategoryId(typeof value === 'string' ? value : 'all')
            }
            value={categoryId}
          >
            <SelectTrigger className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type='submit' variant='outline'>
          {t('expenses.filter.apply')}
        </Button>
      </form>

      {error ? <Notice tone='error'>{error}</Notice> : null}

      {!allowed ? (
        <Notice tone='warning'>
          {scope === 'approvals'
            ? t('expenses.approvals.noPermission')
            : t('expenses.finance.noPermission')}
        </Notice>
      ) : null}

      {loading ? (
        <Loading className='py-10' />
      ) : reports.length === 0 ? (
        <EmptyState
          description={emptyDescription}
          title={emptyTitle ?? t('expenses.empty')}
        />
      ) : (
        <div className='rounded-xl border border-border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('expenses.columns.number')}</TableHead>
                {showEmployee ? (
                  <TableHead>{t('expenses.columns.employee')}</TableHead>
                ) : null}
                <TableHead>{t('expenses.columns.department')}</TableHead>
                <TableHead>{t('expenses.columns.purpose')}</TableHead>
                <TableHead>{t('expenses.columns.amount')}</TableHead>
                <TableHead>{t('expenses.columns.status')}</TableHead>
                <TableHead>{t('expenses.columns.createdAt')}</TableHead>
                <TableHead className='text-right'>
                  {t('expenses.columns.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((report) => (
                <TableRow key={report.id}>
                  <TableCell className='font-medium'>
                    <Link
                      className='text-primary underline-offset-4 hover:underline'
                      to={`/expenses/${report.id}`}
                    >
                      {report.number}
                    </Link>
                  </TableCell>
                  {showEmployee ? (
                    <TableCell>{report.employeeName}</TableCell>
                  ) : null}
                  <TableCell>{report.departmentName}</TableCell>
                  <TableCell className='max-w-64 truncate'>
                    {report.purpose ?? '—'}
                  </TableCell>
                  <TableCell>{formatAmount(report.totalAmount)}</TableCell>
                  <TableCell>
                    <StatusBadge status={report.status} />
                  </TableCell>
                  <TableCell>{formatDate(report.createdAt)}</TableCell>
                  <TableCell className='text-right'>
                    <div className='flex justify-end gap-2'>
                      <Link
                        className={buttonVariants({
                          size: 'sm',
                          variant: 'outline',
                        })}
                        to={`/expenses/${report.id}`}
                      >
                        {t(viewLabelKey)}
                      </Link>
                      {renderActions ? renderActions(report) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!loading && reports.length > 0 ? (
        <p className='text-xs text-muted-foreground'>
          {t('expenses.count', { count: reports.length })}
        </p>
      ) : null}
    </div>
  );
}
