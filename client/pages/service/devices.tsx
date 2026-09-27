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

import { asBoolean, asText, useDebouncedValue } from '../../service/format.js';
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
const DEVICE_STATUSES = ['in_service', 'maintenance', 'retired'];

/** Device register: every device the identity may see, with its region and state. */
export default function DevicesPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const navigate = useNavigate();
  const list = usePagedList(20);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim(), 300);

  const devices = useResource(`${list.key}:${debouncedSearch}`, () =>
    api.listDevices({ ...list.query, search: debouncedSearch || undefined }),
  );

  const rows = devices.data?.data ?? [];
  const total = (devices.data?.meta?.total as number | undefined) ?? 0;

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
        title={t('service.devices.title')}
        description={t('service.devices.description')}
      />

      <div className='flex flex-wrap items-center gap-2'>
        <SearchInput
          value={search}
          onValueChange={setSearch}
          placeholder={t('service.devices.searchPlaceholder')}
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
          options={DEVICE_STATUSES.map((status) => ({
            value: status,
            label: t(`service.status.device.${status}`, {
              defaultValue: status,
            }),
          }))}
        />
        <Button variant='ghost' size='sm' onClick={() => list.reset()}>
          {t('service.common.clearFilters')}
        </Button>
      </div>

      <QueryState
        loading={devices.loading}
        error={devices.error}
        empty={rows.length === 0}
        onRetry={devices.reload}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('service.devices.serialNumber')}</TableHead>
              <TableHead>{t('service.devices.name')}</TableHead>
              <TableHead>{t('service.devices.model')}</TableHead>
              <TableHead>{t('service.devices.location')}</TableHead>
              <TableHead>{t('service.devices.region')}</TableHead>
              <TableHead>{t('service.devices.status')}</TableHead>
              <TableHead>{t('service.devices.enabled')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((device) => (
              <TableRow
                key={device.id}
                className='cursor-pointer'
                onClick={() => {
                  void navigate(`/service/devices/${device.id}`);
                }}
              >
                <TableCell>
                  <Link
                    className='font-medium hover:underline'
                    to={`/service/devices/${device.id}`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {asText(device.serialNumber)}
                  </Link>
                </TableCell>
                <TableCell>{asText(device.name)}</TableCell>
                <TableCell>{asText(device.model) || '—'}</TableCell>
                <TableCell>{asText(device.location) || '—'}</TableCell>
                <TableCell>
                  <RegionBadge value={device.region} />
                </TableCell>
                <TableCell>
                  <StatusBadge kind='device' value={device.status} />
                </TableCell>
                <TableCell>
                  {asBoolean(device.enabled)
                    ? t('service.common.yes')
                    : t('service.common.no')}
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
