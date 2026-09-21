import { useTranslation } from '@nocobase/i18n/client';
import { PencilIcon, PlusIcon, RefreshCw } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { DataTable, type DataTableColumn } from '@/components/data-table';
import { FormDialog } from '@/components/form-dialog';
import { LabFileManager } from '@/components/lab-file-manager';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLabApi } from '@/lib/lab-api';
import { useLabErrorMessage } from '@/lib/lab-errors';
import {
  equipmentChoices,
  laboratoryChoices,
  trainingFields,
} from '@/lib/lab-fields';
import { formatMoment } from '@/lib/lab-format';
import { canWriteIn, hasStaffRole } from '@/lib/lab-permissions';
import type { TrainingRecordView } from '@/lib/lab-types';
import { useAsync } from '@/lib/use-async';

/** Safety and instrument training sessions, with the roster each session left behind. */
export default function TrainingRecordsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useLabApi();
  const [labId, setLabId] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TrainingRecordView | null>(null);
  const [filesOf, setFilesOf] = useState<TrainingRecordView | null>(null);

  const access = useAsync('access', () => api.access());
  const laboratories = useAsync('laboratories', () => api.laboratories());
  const equipment = useAsync('equipment-for-training', () => api.equipment());
  const list = useAsync(`training-records:${labId}`, () =>
    api.trainingRecords({ labId }),
  );
  const message = useLabErrorMessage(list.error);

  const laboratoryOptions = laboratoryChoices(laboratories.data ?? []);
  const equipmentOptions = equipmentChoices(equipment.data ?? []);
  const mayCreate = hasStaffRole(access.data, [
    'lab_admin',
    'teacher',
    'safety_officer',
  ]);

  const columns: DataTableColumn<TrainingRecordView>[] = [
    {
      key: 'title',
      headerKey: 'lab.title',
      text: (row) => row.title,
      className: 'font-medium',
    },
    {
      key: 'laboratory',
      headerKey: 'lab.laboratory',
      text: (row) => row.labName ?? '',
    },
    {
      key: 'equipment',
      headerKey: 'lab.equipment',
      text: (row) => row.equipmentName ?? '',
      render: (row) =>
        row.equipmentName ?? <span className='text-muted-foreground'>—</span>,
    },
    {
      key: 'trainer',
      headerKey: 'lab.trainer',
      text: (row) => row.trainer ?? '',
    },
    {
      key: 'trainedAt',
      headerKey: 'lab.trainedAt',
      text: (row) => row.trainedAt ?? '',
      render: (row) => formatMoment(t, row.trainedAt),
    },
    {
      key: 'participantCount',
      headerKey: 'lab.participantCount',
      className: 'text-right tabular-nums',
      text: (row) => String(row.participantCount),
      render: (row) => (
        <Badge variant='secondary'>{row.participantCount}</Badge>
      ),
    },
    {
      key: 'actions',
      headerKey: 'lab.actions',
      className: 'w-44',
      render: (row) => (
        <div className='flex justify-end gap-1'>
          <Button size='sm' variant='ghost' onClick={() => setFilesOf(row)}>
            {t('lab.attachments')}
          </Button>
          {canWriteIn(access.data, row.labId, [
            'lab_admin',
            'teacher',
            'safety_officer',
          ]) ? (
            <Button size='sm' variant='outline' onClick={() => setEditing(row)}>
              <PencilIcon />
              {t('lab.edit')}
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        actions={
          <>
            <Button
              variant='outline'
              onClick={list.reload}
              disabled={list.loading}
            >
              <RefreshCw />
              {t('lab.refresh')}
            </Button>
            {mayCreate ? (
              <Button onClick={() => setCreating(true)}>
                <PlusIcon />
                {t('lab.createTraining')}
              </Button>
            ) : null}
          </>
        }
        description={t('trainingRecords.description')}
        title={t('trainingRecords.title')}
      />

      <div className='flex flex-wrap items-center gap-2'>
        <Select
          items={[
            { value: '', label: t('lab.allLaboratories') },
            ...laboratoryOptions,
          ]}
          value={labId}
          onValueChange={(value) =>
            setLabId(typeof value === 'string' ? value : '')
          }
        >
          <SelectTrigger className='w-56'>
            <SelectValue placeholder={t('lab.allLaboratories')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value=''>{t('lab.allLaboratories')}</SelectItem>
            {laboratoryOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {message ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('lab.loadFailed')}</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      <DataTable
        columns={columns}
        emptyKey='trainingRecords.empty'
        loading={list.loading}
        rowKey={(row) => row.id}
        rows={list.data ?? []}
        searchText={(row) => `${row.notes ?? ''} ${row.trainer ?? ''}`}
      />

      {filesOf ? (
        <div className='border-border rounded-lg border p-4'>
          <div className='mb-3 flex items-center justify-between gap-2'>
            <p className='text-sm font-medium'>
              {t('lab.filesOf', { name: filesOf.title })}
            </p>
            <Button size='sm' variant='ghost' onClick={() => setFilesOf(null)}>
              {t('lab.close')}
            </Button>
          </div>
          <LabFileManager
            canWrite={canWriteIn(access.data, filesOf.labId, [
              'lab_admin',
              'teacher',
              'safety_officer',
            ])}
            targetId={filesOf.id}
            targetType='training_record'
          />
        </div>
      ) : null}

      {creating ? (
        <FormDialog
          descriptionKey='lab.createTrainingHint'
          fields={trainingFields({
            laboratory: laboratoryOptions,
            equipment: equipmentOptions,
          })}
          onClose={() => setCreating(false)}
          onSubmit={async (values) => {
            await api.createTrainingRecord(values);
            setCreating(false);
            list.reload();
          }}
          titleKey='lab.createTraining'
        />
      ) : null}

      {editing ? (
        <FormDialog
          descriptionKey='lab.editTrainingHint'
          fields={trainingFields({ equipment: equipmentOptions })}
          initialValues={editing}
          onClose={() => setEditing(null)}
          onSubmit={async (values) => {
            await api.updateTrainingRecord(editing.id, values);
            setEditing(null);
            list.reload();
          }}
          titleKey='lab.editTraining'
        />
      ) : null}
    </PageContainer>
  );
}
