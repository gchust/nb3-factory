import { useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { addDays, startOfDay } from 'date-fns';
import { enUS, zhCN } from 'date-fns/locale';
import { LogOutIcon, PlusIcon, SearchIcon, XIcon } from 'lucide-react';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Link, Outlet, useSearchParams } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { DatePicker } from '@/components/date-picker';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { parseDayParam } from './datetime.js';
import { VisitorStatusBadge } from './status-badge.js';
import {
  isVisitorStatus,
  VISITOR_STATUSES,
  type Visitor,
  type VisitorsOutletContext,
} from './types.js';

const ALL = 'all';
const SEARCH_DEBOUNCE_MS = 300;

interface VisitorListState {
  readonly key: string;
  readonly visitors: readonly Visitor[];
  readonly failed: boolean;
}

/** The visitor register: filter by day, employee and status, and see who is still on site. */
export default function VisitorsPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const dateLocale = locale.startsWith('zh') ? zhCN : enUS;
  const format = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );

  // The URL is the filter state: it survives a reload and is what the child
  // route dialogs return to when they close.
  const search = searchParams.get('q') ?? '';
  const employee = searchParams.get('employee') ?? '';
  const status = searchParams.get('status') ?? '';
  const day = useMemo(
    () => parseDayParam(searchParams.get('date')),
    [searchParams],
  );

  const setParam = useCallback(
    (key: string, value: string): void => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (value) {
            next.set(key, value);
          } else {
            next.delete(key);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // The input stays local while typing and commits to the URL once quiet. A
  // change to `search` from outside (the back button, "Clear filters") resets it
  // during render, which is React's supported way to adjust state on a prop
  // change without an effect.
  const [searchInput, setSearchInput] = useState(search);
  const [syncedSearch, setSyncedSearch] = useState(search);
  if (search !== syncedSearch) {
    setSyncedSearch(search);
    setSearchInput(search);
  }
  useEffect(() => {
    if (searchInput === search) {
      return;
    }
    const handle = window.setTimeout(() => {
      setParam('q', searchInput);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [searchInput, search, setParam]);

  const requestQuery = useMemo<Record<string, string>>(() => {
    const query: Record<string, string> = {};
    if (search) {
      query.search = search;
    }
    if (employee) {
      query.employeeName = employee;
    }
    if (isVisitorStatus(status)) {
      query.status = status;
    }
    if (day) {
      // The client owns the timezone: it sends the local day's bounds as instants.
      query.from = startOfDay(day).toISOString();
      query.to = addDays(startOfDay(day), 1).toISOString();
    }
    return query;
  }, [search, employee, status, day]);

  const requestKey = useMemo(
    () => JSON.stringify(requestQuery),
    [requestQuery],
  );
  const [refreshCount, setRefreshCount] = useState(0);
  const [listState, setListState] = useState<VisitorListState>();

  useEffect(() => {
    const controller = new AbortController();
    void api
      .request<{ data: Visitor[] }>({
        path: 'visitors',
        method: 'GET',
        query: requestQuery,
        signal: controller.signal,
      })
      .then((response) =>
        setListState({
          key: requestKey,
          visitors: response.data,
          failed: false,
        }),
      )
      .catch(() => {
        if (controller.signal.aborted) {
          return;
        }
        setListState({ key: requestKey, visitors: [], failed: true });
      });
    return () => controller.abort();
  }, [api, requestKey, requestQuery, refreshCount]);

  const settled = listState?.key === requestKey ? listState : undefined;
  const loading = settled === undefined;
  const visitors = settled?.visitors ?? [];

  const [employeeNames, setEmployeeNames] = useState<readonly string[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    void api
      .request<{ data: string[] }>({
        path: 'visitors/employee-names',
        method: 'GET',
        signal: controller.signal,
      })
      .then((response) => setEmployeeNames(response.data))
      // A failed lookup only means the filter offers no names.
      .catch(() => undefined);
    return () => controller.abort();
  }, [api, refreshCount]);

  const reload = useCallback(() => {
    setRefreshCount((count) => count + 1);
  }, []);
  const outletContext = useMemo<VisitorsOutletContext>(
    () => ({ reload }),
    [reload],
  );

  const overlaySearch = searchParams.toString();
  const overlaySuffix = overlaySearch ? `?${overlaySearch}` : '';

  const columns = useMemo<ColumnDef<Visitor, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('visitors.fields.name')}
          />
        ),
        cell: ({ row }) => (
          <div className='leading-tight'>
            <div className='font-medium'>{row.original.name}</div>
            <div className='text-xs text-muted-foreground'>
              {row.original.phone}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'employeeName',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('visitors.fields.employeeName')}
          />
        ),
      },
      {
        accessorKey: 'reason',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('visitors.fields.reason')}
          />
        ),
        cell: ({ getValue }) => (
          <span className='text-muted-foreground'>{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: 'arrivedAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('visitors.fields.arrivedAt')}
          />
        ),
        cell: ({ getValue }) => (
          <span className='tabular-nums'>
            {format.format(new Date(getValue<string>()))}
          </span>
        ),
      },
      {
        id: 'status',
        accessorFn: (visitor) => (visitor.departedAt ? 'left' : 'onSite'),
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('visitors.fields.status')}
          />
        ),
        cell: ({ row }) => (
          <div className='flex items-center gap-2'>
            <VisitorStatusBadge visitor={row.original} />
            {row.original.departedAt ? (
              <span className='text-xs text-muted-foreground tabular-nums'>
                {format.format(new Date(row.original.departedAt))}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: 'actions',
        enableHiding: false,
        cell: ({ row }) =>
          row.original.departedAt ? null : (
            <div className='text-right'>
              <Button
                variant='outline'
                size='sm'
                nativeButton={false}
                render={
                  <Link
                    to={`/visitors/${row.original.id}/checkout${overlaySuffix}`}
                  />
                }
              >
                <LogOutIcon data-icon='inline-start' />
                {t('visitors.actions.checkout')}
              </Button>
            </div>
          ),
      },
    ],
    [t, format, overlaySuffix],
  );

  const hasFilters = Boolean(search || employee || status || day);
  const clearFilters = (): void => {
    setSearchInput('');
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('visitors.title')}
        description={t('visitors.description')}
        actions={
          <Button
            nativeButton={false}
            render={<Link to={`/visitors/new${overlaySuffix}`} />}
          >
            <PlusIcon data-icon='inline-start' />
            {t('visitors.actions.create')}
          </Button>
        }
      />

      <div className='flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center'>
        <div className='relative sm:max-w-xs sm:flex-1'>
          <SearchIcon className='pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={t('visitors.filters.searchPlaceholder')}
            aria-label={t('visitors.filters.searchPlaceholder')}
            className='ps-9'
          />
        </div>
        <Select
          value={status || ALL}
          onValueChange={(value) =>
            setParam('status', value && value !== ALL ? value : '')
          }
        >
          <SelectTrigger
            className='w-full sm:w-44'
            aria-label={t('visitors.filters.statusLabel')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>
              {t('visitors.filters.anyStatus')}
            </SelectItem>
            {VISITOR_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`visitors.status.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={employee || ALL}
          onValueChange={(value) =>
            setParam('employee', value && value !== ALL ? value : '')
          }
        >
          <SelectTrigger
            className='w-full sm:w-52'
            aria-label={t('visitors.filters.employeeLabel')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>
              {t('visitors.filters.anyEmployee')}
            </SelectItem>
            {employeeNames.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DatePicker
          value={day}
          onChange={(next) =>
            setParam(
              'date',
              next
                ? [
                    next.getFullYear(),
                    String(next.getMonth() + 1).padStart(2, '0'),
                    String(next.getDate()).padStart(2, '0'),
                  ].join('-')
                : '',
            )
          }
          locale={dateLocale}
          placeholder={t('visitors.filters.anyDate')}
          className='w-full sm:w-48'
        />
        {hasFilters ? (
          <Button variant='ghost' onClick={clearFilters}>
            <XIcon data-icon='inline-start' />
            {t('visitors.filters.clear')}
          </Button>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        data={[...visitors]}
        getRowId={(visitor) => String(visitor.id)}
        emptyMessage={
          loading
            ? t('visitors.loading')
            : hasFilters
              ? t('visitors.empty.filtered')
              : t('visitors.empty.all')
        }
        showSelectedCount={false}
        toolbar={
          settled?.failed
            ? () => (
                <span className='text-sm text-destructive'>
                  {t('visitors.error.requestFailed')}
                </span>
              )
            : undefined
        }
      />

      <Outlet context={outletContext} />
    </PageContainer>
  );
}
