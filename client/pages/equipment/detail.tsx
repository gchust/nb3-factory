import { useTranslation } from '@nocobase/i18n/client';
import { PencilIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useParams } from 'react-router';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { CalibrationPanel } from '@/components/calibration-list';
import { DetailGrid, type DetailItem } from '@/components/detail-grid';
import { FormDialog } from '@/components/form-dialog';
import { LabFileManager } from '@/components/lab-file-manager';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { RouteChildPage } from '@/components/route-child-page';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useLabApi } from '@/lib/lab-api';
import { useLabErrorMessage } from '@/lib/lab-errors';
import { equipmentFields } from '@/lib/lab-fields';
import { formatDay } from '@/lib/lab-format';
import { canWriteIn } from '@/lib/lab-permissions';
import { labelFor } from '@/lib/lab-options';
import { statusTone } from '@/lib/lab-status';
import { EQUIPMENT_STATUS_OPTIONS } from '@/lib/lab-types';
import { useAsync } from '@/lib/use-async';
import { EquipmentReservations } from './reservations.js';

/** One instrument, with its calibration history, bookings and documents. */
export default function EquipmentDetailPage(): ReactElement {
  const { t } = useTranslation();
  const params = useParams<{ equipmentId: string }>();
  const equipmentId = Number(params.equipmentId);
  const api = useLabApi();
  const [editing, setEditing] = useState(false);
  const state = useAsync(`equipment-record:${equipmentId}`, async () => ({
    equipment: await api.equipmentRecord(equipmentId),
    access: await api.access(),
  }));
  const message = useLabErrorMessage(state.error);
  const equipment = state.data?.equipment;
  const access = state.data?.access;
  const canManage = equipment
    ? canWriteIn(access, equipment.labId, ['lab_admin'])
    : false;
  const canWriteFiles = equipment
    ? canWriteIn(access, equipment.labId, ['lab_admin', 'technician'])
    : false;

  const items: DetailItem[] = equipment
    ? [
        { label: t('lab.assetNo'), value: equipment.assetNo },
        {
          label: t('lab.laboratory'),
          value: equipment.labName ?? t('lab.unset'),
        },
        {
          label: t('lab.status'),
          value: (
            <Badge variant={statusTone(equipment.status)}>
              {labelFor(EQUIPMENT_STATUS_OPTIONS, equipment.status, t)}
            </Badge>
          ),
        },
        {
          label: t('lab.category'),
          value: equipment.category ?? t('lab.unset'),
        },
        { label: t('lab.model'), value: equipment.model ?? t('lab.unset') },
        {
          label: t('lab.serialNo'),
          value: equipment.serialNo ?? t('lab.unset'),
        },
        {
          label: t('lab.ownerName'),
          value: equipment.ownerName ?? t('lab.unset'),
        },
        {
          label: t('lab.purchaseDate'),
          value: formatDay(t, equipment.purchaseDate),
        },
        {
          label: t('lab.calibration'),
          value: (
            <Badge
              variant={
                equipment.calibrationExpired
                  ? 'destructive'
                  : equipment.calibrationExpiringSoon
                    ? 'secondary'
                    : 'default'
              }
            >
              {equipment.calibrationExpiresAt
                ? formatDay(t, equipment.calibrationExpiresAt)
                : t('lab.calibrationMissing')}
            </Badge>
          ),
        },
        {
          label: t('lab.blockingIssues'),
          value:
            equipment.openBlockingIssues > 0 ? (
              <Badge variant='destructive'>
                {equipment.openBlockingIssues}
              </Badge>
            ) : (
              '0'
            ),
        },
        {
          label: t('lab.studentVisible'),
          value: equipment.studentVisible ? t('lab.yes') : t('lab.no'),
        },
        {
          label: t('lab.description'),
          value: equipment.description ?? t('lab.unset'),
        },
        {
          label: t('lab.studentDescription'),
          value: equipment.studentDescription ?? t('lab.unset'),
        },
      ]
    : [];

  return (
    <RouteChildPage>
      <PageContainer className='mx-auto max-w-6xl'>
        <Breadcrumbs />
        <PageHeader
          actions={
            canManage ? (
              <Button variant='outline' onClick={() => setEditing(true)}>
                <PencilIcon />
                {t('lab.edit')}
              </Button>
            ) : null
          }
          description={
            equipment
              ? `${equipment.assetNo} · ${equipment.labName ?? ''}`
              : undefined
          }
          title={equipment ? equipment.name : t('equipment.detailTitle')}
        />

        {message ? (
          <Alert variant='destructive'>
            <AlertTitle>{t('lab.loadFailed')}</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}

        {state.loading && !equipment ? (
          <Skeleton className='h-40 w-full' />
        ) : null}

        {equipment ? (
          <>
            {equipment.restricted ? (
              <Alert>
                <AlertDescription>{t('equipment.restricted')}</AlertDescription>
              </Alert>
            ) : null}
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>{t('lab.record')}</CardTitle>
              </CardHeader>
              <CardContent>
                <DetailGrid items={items} />
              </CardContent>
            </Card>

            <CalibrationPanel
              canWrite={canWriteIn(access, equipment.labId, [
                'lab_admin',
                'technician',
              ])}
              equipmentId={equipment.id}
              equipmentOptions={[]}
            />

            <EquipmentReservations
              canCancelAny={canManage}
              canReserve={canManage || !equipment.restricted}
              currentUserId={access?.userId}
              equipmentId={equipment.id}
            />

            <Card>
              <CardHeader>
                <CardTitle className='text-base'>
                  {t('lab.attachments')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <LabFileManager
                  canWrite={canWriteFiles}
                  targetId={equipment.id}
                  targetType='equipment'
                />
              </CardContent>
            </Card>
          </>
        ) : null}
      </PageContainer>

      {editing && equipment ? (
        <FormDialog
          descriptionKey='lab.editEquipmentHint'
          fields={equipmentFields(t, [], false)}
          initialValues={equipment}
          onClose={() => setEditing(false)}
          onSubmit={async (values) => {
            await api.updateEquipment(equipment.id, values);
            setEditing(false);
            state.reload();
          }}
          titleKey='lab.editEquipment'
        />
      ) : null}
    </RouteChildPage>
  );
}
