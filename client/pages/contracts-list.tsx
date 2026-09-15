import { useTranslation } from '@nocobase/i18n/client';
import { apiClientToken, useService } from '@nocobase/app-client';
import {
  CalendarClock,
  BarChart3,
  Plus,
  RotateCcw,
  Search,
} from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router';

import { SelectField } from '@/components/select-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loading } from '@/components/loading';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  apiErrorCode,
  fetchCapabilities,
  fetchContracts,
  type Contract,
  type ContractCapabilities,
} from '@/lib/contracts';
import { daysUntil, formatAmount, formatDate } from '@/lib/format';

const CONTRACT_TYPES = ['sale', 'purchase', 'service', 'lease'] as const;
const CONTRACT_STATUSES = ['draft', 'active', 'expired', 'terminated'] as const;
const EXPIRING_DAYS = 30;
/** Sentinel for the "no filter" option; the Select treats an empty string poorly. */
const ANY = '__any__';

export default function ContractsListPage(): ReactElement {
  const api = useService(apiClientToken);
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [type, setType] = useState(ANY);
  const [status, setStatus] = useState(ANY);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [expiringOnly, setExpiringOnly] = useState(false);
  const [contracts, setContracts] = useState<readonly Contract[]>();
  const [capabilities, setCapabilities] = useState<ContractCapabilities>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchContracts(api, {
        ...(type !== ANY ? { type } : {}),
        ...(status !== ANY ? { status } : {}),
        ...(search ? { search } : {}),
        ...(expiringOnly ? { expiringDays: EXPIRING_DAYS } : {}),
      }),
      fetchCapabilities(api),
    ]).then(
      ([list, caps]) => {
        if (!active) return;
        setContracts(list);
        setCapabilities(caps);
        setError(undefined);
      },
      (cause: unknown) => {
        if (!active) return;
        setError(
          t(`contracts.errors.${apiErrorCode(cause) ?? 'loadFailed'}`, {
            defaultValue: 'Something went wrong while loading.',
          }),
        );
      },
    );
    return () => {
      active = false;
    };
  }, [api, expiringOnly, search, status, t, type]);

  const typeOptions = [
    {
      value: ANY,
      label: t('contracts.filter.allTypes', { defaultValue: 'All types' }),
    },
    ...CONTRACT_TYPES.map((value) => ({
      value,
      label: t(`contracts.type.${value}`, { defaultValue: value }),
    })),
  ];
  const statusOptions = [
    {
      value: ANY,
      label: t('contracts.filter.allStatuses', {
        defaultValue: 'All statuses',
      }),
    },
    ...CONTRACT_STATUSES.map((value) => ({
      value,
      label: t(`contracts.status.${value}`, { defaultValue: value }),
    })),
  ];

  return (
    <section className='space-y-6 p-6'>
      <header className='flex flex-wrap items-start justify-between gap-4'>
        <div className='space-y-1'>
          <h1 className='font-heading text-2xl font-semibold tracking-tight'>
            {t('contracts.title', { defaultValue: 'Contract ledger' })}
          </h1>
          <p className='text-sm text-muted-foreground'>
            {t('contracts.description', {
              defaultValue:
                'Track every contract, its versions and its scanned files.',
            })}
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <Button
            onClick={() => {
              void navigate('/contracts/stats');
            }}
            type='button'
            variant='outline'
          >
            <BarChart3 />
            {t('contracts.nav.stats', { defaultValue: 'Statistics' })}
          </Button>
          {capabilities?.canCreate ? (
            <Button
              onClick={() => {
                void navigate('/contracts/new');
              }}
              type='button'
            >
              <Plus />
              {t('contracts.actions.create', { defaultValue: 'New contract' })}
            </Button>
          ) : null}
        </div>
      </header>

      <div className='flex flex-wrap items-end gap-3'>
        <div className='w-40'>
          <SelectField
            onChange={setType}
            options={typeOptions}
            placeholder={t('contracts.filter.type', { defaultValue: 'Type' })}
            value={type}
          />
        </div>
        <div className='w-40'>
          <SelectField
            onChange={setStatus}
            options={statusOptions}
            placeholder={t('contracts.filter.status', {
              defaultValue: 'Status',
            })}
            value={status}
          />
        </div>
        <Button
          aria-pressed={expiringOnly}
          onClick={() => setExpiringOnly((current) => !current)}
          type='button'
          variant={expiringOnly ? 'default' : 'outline'}
        >
          <CalendarClock />
          {t('contracts.filter.expiring', {
            defaultValue: 'Expiring within 30 days',
          })}
        </Button>
        <form
          className='flex items-center gap-2'
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchInput.trim());
          }}
        >
          <Input
            aria-label={t('contracts.filter.search', {
              defaultValue: 'Search contracts',
            })}
            className='w-64'
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={t('contracts.filter.searchPlaceholder', {
              defaultValue: 'Name, number or counterparty',
            })}
            value={searchInput}
          />
          <Button type='submit' variant='outline'>
            <Search />
            {t('contracts.actions.search', { defaultValue: 'Search' })}
          </Button>
        </form>
        {type !== ANY || status !== ANY || search || expiringOnly ? (
          <Button
            onClick={() => {
              setType(ANY);
              setStatus(ANY);
              setSearch('');
              setSearchInput('');
              setExpiringOnly(false);
            }}
            type='button'
            variant='ghost'
          >
            <RotateCcw />
            {t('contracts.filter.reset', { defaultValue: 'Reset' })}
          </Button>
        ) : null}
      </div>

      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {contracts === undefined && !error ? (
        <Loading
          label={t('contracts.loading', { defaultValue: 'Loading contracts' })}
        />
      ) : (
        <div className='rounded-lg border border-border bg-card'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {t('contracts.fields.contractNo', { defaultValue: 'No.' })}
                </TableHead>
                <TableHead>
                  {t('contracts.fields.name', { defaultValue: 'Name' })}
                </TableHead>
                <TableHead>
                  {t('contracts.fields.counterparty', {
                    defaultValue: 'Counterparty',
                  })}
                </TableHead>
                <TableHead>
                  {t('contracts.fields.type', { defaultValue: 'Type' })}
                </TableHead>
                <TableHead>
                  {t('contracts.fields.status', { defaultValue: 'Status' })}
                </TableHead>
                <TableHead className='text-right'>
                  {t('contracts.fields.amount', { defaultValue: 'Amount' })}
                </TableHead>
                <TableHead>
                  {t('contracts.fields.expiryDate', {
                    defaultValue: 'Expires',
                  })}
                </TableHead>
                <TableHead>
                  {t('contracts.fields.remainingDays', {
                    defaultValue: 'Days left',
                  })}
                </TableHead>
                <TableHead>
                  {t('contracts.fields.owner', { defaultValue: 'Owner' })}
                </TableHead>
                <TableHead className='text-right'>
                  {t('contracts.fields.actions', { defaultValue: 'Actions' })}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts && contracts.length > 0 ? (
                contracts.map((contract) => (
                  <TableRow key={contract.id}>
                    <TableCell className='font-mono text-xs'>
                      {contract.contractNo}
                    </TableCell>
                    <TableCell className='font-medium'>
                      <Link
                        className='underline-offset-4 hover:underline'
                        to={`/contracts/${contract.id}`}
                      >
                        {contract.name}
                      </Link>
                    </TableCell>
                    <TableCell>{contract.counterparty}</TableCell>
                    <TableCell>
                      {t(`contracts.type.${contract.type}`, {
                        defaultValue: contract.type,
                      })}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={contract.status} />
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {formatAmount(contract.amount)}
                    </TableCell>
                    <TableCell>{formatDate(contract.expiryDate)}</TableCell>
                    <TableCell>
                      <RemainingDays expiryDate={contract.expiryDate} />
                    </TableCell>
                    <TableCell>
                      {contract.ownerName ?? contract.ownerId}
                    </TableCell>
                    <TableCell className='text-right'>
                      <Button
                        onClick={() => {
                          void navigate(`/contracts/${contract.id}`);
                        }}
                        size='sm'
                        type='button'
                        variant='outline'
                      >
                        {t('contracts.actions.view', { defaultValue: 'View' })}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell className='text-muted-foreground' colSpan={10}>
                    {t('contracts.empty', {
                      defaultValue: 'No contracts found.',
                    })}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

function StatusBadge({ status }: { readonly status: string }): ReactElement {
  const { t } = useTranslation();
  const variant =
    status === 'active'
      ? 'default'
      : status === 'terminated'
        ? 'destructive'
        : 'secondary';
  return (
    <Badge variant={variant}>
      {t(`contracts.status.${status}`, { defaultValue: status })}
    </Badge>
  );
}

function RemainingDays({
  expiryDate,
}: {
  readonly expiryDate: string | null;
}): ReactElement {
  const { t } = useTranslation();
  const days = daysUntil(expiryDate);
  if (days === null) return <span className='text-muted-foreground'>—</span>;
  if (days < 0) {
    return (
      <span className='text-destructive'>
        {t('contracts.remaining.expired', { defaultValue: 'Expired' })}
      </span>
    );
  }
  const urgent = days <= EXPIRING_DAYS;
  return (
    <span className={urgent ? 'font-medium text-destructive' : undefined}>
      {t('contracts.remaining.days', {
        defaultValue: '{{count}} days',
        count: days,
      })}
    </span>
  );
}
