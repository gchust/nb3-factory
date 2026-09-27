import { useTranslation } from '@nocobase/i18n/client';
import { useMemo, useState, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { asText, useDebouncedValue } from '../../service/format.js';
import { usePagedList } from '../../service/use-paged-list.js';
import { useResource, useServiceApi } from '../../service/api.js';
import {
  FilterSelect,
  ListPager,
  QueryState,
  RegionBadge,
  SearchInput,
  StatusBadge,
} from '../../service/ui.js';

const REGIONS = ['east', 'south'];

/** Customer register: scoped search, region and status filters, paged. */
export default function CustomersPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const navigate = useNavigate();
  const list = usePagedList(20);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim(), 300);

  const customers = useResource(`${list.key}:${debouncedSearch}`, () =>
    api.listCustomers({ ...list.query, search: debouncedSearch || undefined }),
  );

  const rows = customers.data?.data ?? [];
  const total = (customers.data?.meta?.total as number | undefined) ?? 0;

  const regionOptions = useMemo(
    () =>
      REGIONS.map((region) => ({
        value: region,
        label: t(`service.region.${region}`, { defaultValue: region }),
      })),
    [t],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('service.customers.title')}
        description={t('service.customers.description')}
      />

      <div className='flex flex-wrap items-center gap-2'>
        <SearchInput
          value={search}
          onValueChange={setSearch}
          placeholder={t('service.customers.searchPlaceholder')}
        />
        <FilterSelect
          allLabel={t('service.common.all')}
          value={list.filters.region ?? 'all'}
          onValueChange={(value) =>
            list.setFilter('region', value === 'all' ? undefined : value)
          }
          options={regionOptions}
        />
        <FilterSelect
          allLabel={t('service.common.all')}
          value={list.filters.status ?? 'all'}
          onValueChange={(value) =>
            list.setFilter('status', value === 'all' ? undefined : value)
          }
          options={[
            { value: 'active', label: t('service.status.customer.active') },
            { value: 'inactive', label: t('service.status.customer.inactive') },
          ]}
        />
        <Button variant='ghost' size='sm' onClick={() => list.reset()}>
          {t('service.common.clearFilters')}
        </Button>
      </div>

      <QueryState
        loading={customers.loading}
        error={customers.error}
        empty={rows.length === 0}
        onRetry={customers.reload}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('service.customers.code')}</TableHead>
              <TableHead>{t('service.customers.name')}</TableHead>
              <TableHead>{t('service.customers.contact')}</TableHead>
              <TableHead>{t('service.customers.phone')}</TableHead>
              <TableHead>{t('service.customers.region')}</TableHead>
              <TableHead>{t('service.customers.level')}</TableHead>
              <TableHead>{t('service.customers.status')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((customer) => (
              <TableRow
                key={customer.id}
                className='cursor-pointer'
                onClick={() => {
                  void navigate(`/service/customers/${customer.id}`);
                }}
              >
                <TableCell>{asText(customer.code)}</TableCell>
                <TableCell>
                  <Link
                    className='font-medium hover:underline'
                    to={`/service/customers/${customer.id}`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {asText(customer.name)}
                  </Link>
                </TableCell>
                <TableCell>{asText(customer.contactName) || '—'}</TableCell>
                <TableCell>{asText(customer.contactPhone) || '—'}</TableCell>
                <TableCell>
                  <RegionBadge value={customer.region} />
                </TableCell>
                <TableCell>
                  <StatusBadge kind='level' value={customer.level} />
                </TableCell>
                <TableCell>
                  <StatusBadge kind='customer' value={customer.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <ListPager
          page={list.page}
          pageSize={list.pageSize}
          total={total}
          onPageChange={(page) => list.setPage(page)}
        />
      </QueryState>
    </PageContainer>
  );
}
