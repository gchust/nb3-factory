import { useTranslation } from '@nocobase/i18n/client';
import { Search } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { DataState } from '@/components/repair/data-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { repairApi } from '@/lib/repair-api';
import { useApiData, useRepairMeta } from '@/lib/use-repair';

const ALL = '__all__';

export default function EquipmentListPage(): ReactElement {
  const { t } = useTranslation();
  const meta = useRepairMeta();
  const [buildingId, setBuildingId] = useState<string>(ALL);
  const [keyword, setKeyword] = useState('');
  const equipment = useApiData(
    `repair/equipment:${buildingId}:${keyword}`,
    (api) =>
      repairApi.equipment(api, {
        buildingId: buildingId === ALL ? undefined : Number(buildingId),
        keyword: keyword || undefined,
      }),
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('repair.equipment.title', {
          defaultValue: 'Equipment registry',
        })}
        description={t('repair.equipment.description', {
          defaultValue:
            'Equipment per building and room, with its manual and repair history.',
        })}
      />

      <div className='flex flex-wrap items-end gap-3'>
        <div className='w-48 space-y-1'>
          <Select
            value={buildingId}
            onValueChange={(value) => setBuildingId(value ?? ALL)}
          >
            <SelectTrigger
              aria-label={t('repair.equipment.building', {
                defaultValue: 'Building',
              })}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>
                {t('repair.tickets.allBuildings', {
                  defaultValue: 'All buildings',
                })}
              </SelectItem>
              {(meta.data?.buildings ?? []).map((building) => (
                <SelectItem key={building.id} value={String(building.id)}>
                  {building.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Input
          className='w-64'
          placeholder={t('repair.equipment.search', {
            defaultValue: 'Name or code',
          })}
          aria-label={t('repair.equipment.search', {
            defaultValue: 'Name or code',
          })}
          value={keyword}
          onChange={(event) => setKeyword(event.currentTarget.value)}
        />
        <Button type='button' variant='outline' onClick={equipment.reload}>
          <Search aria-hidden='true' />
          {t('repair.tickets.search', { defaultValue: 'Search' })}
        </Button>
      </div>

      <DataState
        loading={equipment.loading}
        error={equipment.error}
        empty={equipment.data?.rows.length === 0}
        onRetry={equipment.reload}
      >
        <div className='rounded-md border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {t('repair.equipment.code', { defaultValue: 'Code' })}
                </TableHead>
                <TableHead>
                  {t('repair.equipment.name', { defaultValue: 'Name' })}
                </TableHead>
                <TableHead>
                  {t('repair.equipment.category', { defaultValue: 'Category' })}
                </TableHead>
                <TableHead>
                  {t('repair.equipment.place', { defaultValue: 'Place' })}
                </TableHead>
                <TableHead>
                  {t('repair.equipment.status', { defaultValue: 'Status' })}
                </TableHead>
                <TableHead>
                  {t('repair.equipment.repairs', { defaultValue: 'Repairs' })}
                </TableHead>
                <TableHead>
                  {t('repair.equipment.manual', { defaultValue: 'Manual' })}
                </TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(equipment.data?.rows ?? []).map((item) => (
                <TableRow key={item.id} data-testid='equipment-row'>
                  <TableCell className='font-mono text-xs'>
                    {item.code}
                  </TableCell>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>{item.category}</TableCell>
                  <TableCell className='text-sm text-muted-foreground'>
                    {[item.buildingName, item.roomNumber]
                      .filter(Boolean)
                      .join(' ')}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        item.status === 'normal' ? 'secondary' : 'destructive'
                      }
                    >
                      {t(`repair.equipmentStatus.${item.status}`, {
                        defaultValue: item.status,
                      })}
                    </Badge>
                  </TableCell>
                  <TableCell className='tabular-nums'>
                    {item.repairCount}
                  </TableCell>
                  <TableCell className='text-sm'>
                    {item.manualFileId
                      ? t('repair.equipment.hasManual', {
                          defaultValue: 'Available',
                        })
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <Button
                      size='sm'
                      variant='ghost'
                      render={<Link to={`/equipment/${item.id}`} />}
                    >
                      {t('repair.tickets.open', { defaultValue: 'Open' })}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DataState>
    </PageContainer>
  );
}
