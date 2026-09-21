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
import { laboratoryChoices, safetyCheckFields } from '@/lib/lab-fields';
import { formatMoment } from '@/lib/lab-format';
import type { FormFieldSpec } from '@/lib/lab-form';
import { labelFor, optionLabels } from '@/lib/lab-options';
import { canWriteIn, hasStaffRole } from '@/lib/lab-permissions';
import { statusTone } from '@/lib/lab-status';
import {
  SAFETY_RESULT_OPTIONS,
  SAFETY_SEVERITY_OPTIONS,
  SAFETY_STATUS_OPTIONS,
  type SafetyCheckView,
} from '@/lib/lab-types';
import { useAsync } from '@/lib/use-async';

const CLOSE_FIELDS: readonly FormFieldSpec[] = [
  {
    name: 'comment',
    labelKey: 'lab.closeComment',
    kind: 'textarea',
    required: true,
    full: true,
  },
];

/** Safety inspections, their findings and their closure. */
export default function SafetyChecksPage(): ReactElement {
  const { t } = useTranslation();
  const api = useLabApi();
  const [result, setResult] = useState('');
  const [severity, setSeverity] = useState('');
  const [labId, setLabId] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<SafetyCheckView | null>(null);
  const [closing, setClosing] = useState<SafetyCheckView | null>(null);
  const [filesOf, setFilesOf] = useState<SafetyCheckView | null>(null);

  const access = useAsync('access', () => api.access());
  const laboratories = useAsync('laboratories', () => api.laboratories());
  const list = useAsync(`safety-checks:${result}:${severity}:${labId}`, () =>
    api.safetyChecks({ status: '', severity, labId, result }),
  );
  const message = useLabErrorMessage(list.error);

  const laboratoryOptions = laboratoryChoices(laboratories.data ?? []);
  const mayCreate = hasStaffRole(access.data, ['lab_admin', 'safety_officer']);
  const canManage = (check: SafetyCheckView): boolean =>
    check.status !== 'closed' &&
    canWriteIn(access.data, check.labId, ['lab_admin', 'safety_officer']);

  const columns: DataTableColumn<SafetyCheckView>[] = [
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
      key: 'checkType',
      headerKey: 'lab.checkType',
      text: (row) => row.checkType ?? '',
    },
    {
      key: 'result',
      headerKey: 'lab.result',
      text: (row) => row.result,
      render: (row) => (
        <Badge variant={statusTone(row.result)}>
          {labelFor(SAFETY_RESULT_OPTIONS, row.result, t)}
        </Badge>
      ),
    },
    {
      key: 'severity',
      headerKey: 'lab.severity',
      text: (row) => row.severity ?? '',
      render: (row) =>
        row.severity ? (
          <Badge variant={statusTone(row.severity)}>
            {labelFor(SAFETY_SEVERITY_OPTIONS, row.severity, t)}
          </Badge>
        ) : (
          <span className='text-muted-foreground'>—</span>
        ),
    },
    {
      key: 'status',
      headerKey: 'lab.status',
      text: (row) => row.status,
      render: (row) => (
        <Badge variant={statusTone(row.status)}>
          {labelFor(SAFETY_STATUS_OPTIONS, row.status, t)}
        </Badge>
      ),
    },
    {
      key: 'checkedAt',
      headerKey: 'lab.checkedAt',
      text: (row) => row.checkedAt ?? '',
      render: (row) => formatMoment(t, row.checkedAt),
    },
    {
      key: 'actions',
      headerKey: 'lab.actions',
      className: 'w-56',
      render: (row) => (
        <div className='flex justify-end gap-1'>
          <Button size='sm' variant='ghost' onClick={() => setFilesOf(row)}>
            {t('lab.attachments')}
          </Button>
          {canManage(row) ? (
            <>
              <Button
                size='sm'
                variant='outline'
                onClick={() => setEditing(row)}
              >
                <PencilIcon />
                {t('lab.edit')}
              </Button>
              <Button
                size='sm'
                variant='outline'
                onClick={() => setClosing(row)}
              >
                {t('lab.closeCheck')}
              </Button>
            </>
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
                {t('lab.createSafetyCheck')}
              </Button>
            ) : null}
          </>
        }
        description={t('safetyChecks.description')}
        title={t('safetyChecks.title')}
      />

      <div className='flex flex-wrap items-center gap-2'>
        <Select
          items={[
            { value: '', label: t('lab.allResults') },
            ...optionLabels(SAFETY_RESULT_OPTIONS, t),
          ]}
          value={result}
          onValueChange={(value) =>
            setResult(typeof value === 'string' ? value : '')
          }
        >
          <SelectTrigger className='w-44'>
            <SelectValue placeholder={t('lab.allResults')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value=''>{t('lab.allResults')}</SelectItem>
            {optionLabels(SAFETY_RESULT_OPTIONS, t).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={[
            { value: '', label: t('lab.allSeverities') },
            ...optionLabels(SAFETY_SEVERITY_OPTIONS, t),
          ]}
          value={severity}
          onValueChange={(value) =>
            setSeverity(typeof value === 'string' ? value : '')
          }
        >
          <SelectTrigger className='w-44'>
            <SelectValue placeholder={t('lab.allSeverities')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value=''>{t('lab.allSeverities')}</SelectItem>
            {optionLabels(SAFETY_SEVERITY_OPTIONS, t).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        emptyKey='safetyChecks.empty'
        loading={list.loading}
        rowKey={(row) => row.id}
        rows={list.data ?? []}
        searchText={(row) => `${row.findings ?? ''} ${row.checkType ?? ''}`}
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
              'safety_officer',
            ])}
            targetId={filesOf.id}
            targetType='safety_check'
          />
        </div>
      ) : null}

      {creating ? (
        <FormDialog
          descriptionKey='lab.createSafetyCheckHint'
          fields={safetyCheckFields(t, laboratoryOptions, true)}
          onClose={() => setCreating(false)}
          onSubmit={async (values) => {
            await api.createSafetyCheck(values);
            setCreating(false);
            list.reload();
          }}
          titleKey='lab.createSafetyCheck'
        />
      ) : null}

      {editing ? (
        <FormDialog
          descriptionKey='lab.editSafetyCheckHint'
          fields={safetyCheckFields(t, laboratoryOptions, false)}
          initialValues={editing}
          onClose={() => setEditing(null)}
          onSubmit={async (values) => {
            await api.updateSafetyCheck(editing.id, values);
            setEditing(null);
            list.reload();
          }}
          titleKey='lab.editSafetyCheck'
        />
      ) : null}

      {closing ? (
        <FormDialog
          descriptionKey='lab.closeCheckHint'
          fields={CLOSE_FIELDS}
          onClose={() => setClosing(null)}
          onSubmit={async (values) => {
            await api.closeSafetyCheck(closing.id, values);
            setClosing(null);
            list.reload();
          }}
          submitKey='lab.closeCheck'
          titleKey='lab.closeCheckConfirm'
        />
      ) : null}
    </PageContainer>
  );
}
