import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { DataState } from '@/components/repair/data-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { repairApi } from '@/lib/repair-api';
import { useApiData } from '@/lib/use-repair';

export default function AssetsPage(): ReactElement {
  const { t } = useTranslation();
  const buildings = useApiData('repair/buildings', (api) =>
    repairApi.buildings(api),
  );
  const rooms = useApiData('repair/rooms', (api) => repairApi.rooms(api));

  return (
    <PageContainer>
      <PageHeader
        title={t('repair.assets.title', {
          defaultValue: 'Buildings and rooms',
        })}
        description={t('repair.assets.description', {
          defaultValue: 'The asset registry every repair request points at.',
        })}
      />

      <div className='grid gap-4 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>
              {t('repair.assets.buildings', { defaultValue: 'Buildings' })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataState
              loading={buildings.loading}
              error={buildings.error}
              empty={buildings.data?.rows.length === 0}
              onRetry={buildings.reload}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      {t('repair.assets.code', { defaultValue: 'Code' })}
                    </TableHead>
                    <TableHead>
                      {t('repair.assets.name', { defaultValue: 'Name' })}
                    </TableHead>
                    <TableHead>
                      {t('repair.assets.floors', { defaultValue: 'Floors' })}
                    </TableHead>
                    <TableHead>
                      {t('repair.assets.rooms', { defaultValue: 'Rooms' })}
                    </TableHead>
                    <TableHead>
                      {t('repair.assets.manager', { defaultValue: 'Manager' })}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(buildings.data?.rows ?? []).map((building) => (
                    <TableRow key={building.id} data-testid='building-row'>
                      <TableCell className='font-mono text-xs'>
                        {building.code}
                      </TableCell>
                      <TableCell>{building.name}</TableCell>
                      <TableCell className='tabular-nums'>
                        {building.floors ?? '—'}
                      </TableCell>
                      <TableCell className='tabular-nums'>
                        {building.roomCount}
                      </TableCell>
                      <TableCell className='text-sm'>
                        {building.manager ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DataState>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {t('repair.assets.rooms', { defaultValue: 'Rooms' })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataState
              loading={rooms.loading}
              error={rooms.error}
              empty={rooms.data?.rows.length === 0}
              onRetry={rooms.reload}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      {t('repair.assets.building', {
                        defaultValue: 'Building',
                      })}
                    </TableHead>
                    <TableHead>
                      {t('repair.assets.room', { defaultValue: 'Room' })}
                    </TableHead>
                    <TableHead>
                      {t('repair.assets.floor', { defaultValue: 'Floor' })}
                    </TableHead>
                    <TableHead>
                      {t('repair.assets.occupant', {
                        defaultValue: 'Occupant',
                      })}
                    </TableHead>
                    <TableHead>
                      {t('repair.assets.area', { defaultValue: 'Area' })}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(rooms.data?.rows ?? []).map((room) => (
                    <TableRow key={room.id} data-testid='room-row'>
                      <TableCell className='text-sm'>
                        {room.buildingName ?? '—'}
                      </TableCell>
                      <TableCell className='font-mono text-xs'>
                        {room.roomNumber}
                      </TableCell>
                      <TableCell className='tabular-nums'>
                        {room.floor ?? '—'}
                      </TableCell>
                      <TableCell className='text-sm'>
                        {room.occupant ?? '—'}
                      </TableCell>
                      <TableCell className='tabular-nums'>
                        {room.area ? (
                          <Badge variant='outline'>{room.area} m²</Badge>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DataState>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
