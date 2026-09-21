import { useTranslation } from '@nocobase/i18n/client';
import { PaperclipIcon, PlusIcon, RefreshCw } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { DataTable, type DataTableColumn } from './data-table.js';
import { FormDialog } from './form-dialog.js';
import { LabFileManager } from './lab-file-manager.js';
import { Alert, AlertDescription, AlertTitle } from './ui/alert.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.js';
import { useLabApi } from '@/lib/lab-api';
import { calibrationFields } from '@/lib/lab-fields';
import { useLabErrorMessage } from '@/lib/lab-errors';
import { formatMoment } from '@/lib/lab-format';
import type { FormFieldSpec } from '@/lib/lab-form';
import { labelFor } from '@/lib/lab-options';
import { calibrationTone, statusTone } from '@/lib/lab-status';
import {
  CALIBRATION_RESULT_OPTIONS,
  type CalibrationView,
} from '@/lib/lab-types';
import { useAsync } from '@/lib/use-async';

export interface CalibrationPanelProps {
  /** The equipment whose record is being shown, when the panel is not listing every instrument. */
  readonly equipmentId?: number;
  /** Choices for the equipment select, used when the panel is the calibrations page itself. */
  readonly equipmentOptions: readonly { value: string; label: string }[];
  /** How the equipment of a calibration is named in the table. */
  readonly equipmentLabel?: (equipmentId: number) => string;
  readonly canWrite: boolean;
  readonly titleKey?: string;
}

/**
 * Calibration history, with the certificate attached to each record.
 *
 * The same panel serves the calibrations page and the equipment detail page: the difference is only
 * whether the instrument is fixed or chosen, so the table, the form and the certificate viewer are
 * written once.
 */
export function CalibrationPanel({
  equipmentId,
  equipmentOptions,
  equipmentLabel,
  canWrite,
  titleKey = 'lab.calibrations',
}: CalibrationPanelProps): ReactElement {
  const { t } = useTranslation();
  const api = useLabApi();
  const key =
    equipmentId === undefined ? 'calibrations' : `calibrations:${equipmentId}`;
  const list = useAsync(key, () =>
    api.calibrations(equipmentId === undefined ? {} : { equipmentId }),
  );
  const [creating, setCreating] = useState(false);
  const [certificateOf, setCertificateOf] = useState<CalibrationView | null>(
    null,
  );
  const message = useLabErrorMessage(list.error);

  const fields: FormFieldSpec[] = [
    ...(equipmentId === undefined
      ? [
          {
            name: 'equipmentId',
            labelKey: 'lab.equipment',
            kind: 'select' as const,
            required: true,
            options: equipmentOptions,
          },
        ]
      : []),
    ...calibrationFields(t, equipmentId === undefined, equipmentOptions),
  ];

  const columns: DataTableColumn<CalibrationView>[] = [
    ...(equipmentId === undefined
      ? [
          {
            key: 'equipment',
            headerKey: 'lab.equipment',
            text: (row: CalibrationView) =>
              equipmentLabel?.(row.equipmentId) ?? '',
          },
        ]
      : []),
    {
      key: 'calibratedAt',
      headerKey: 'lab.calibratedAt',
      text: (row) => row.calibratedAt ?? '',
      render: (row) => formatMoment(t, row.calibratedAt),
    },
    {
      key: 'expiresAt',
      headerKey: 'lab.expiresAt',
      text: (row) => row.expiresAt ?? '',
      render: (row) => (
        <div className='flex items-center gap-2'>
          <span>{formatMoment(t, row.expiresAt)}</span>
          <Badge variant={calibrationTone(row.expired, false)}>
            {t(row.expired ? 'lab.calibrationExpired' : 'lab.calibrationValid')}
          </Badge>
        </div>
      ),
    },
    {
      key: 'result',
      headerKey: 'lab.result',
      text: (row) => row.result,
      render: (row) => (
        <Badge variant={statusTone(row.result)}>
          {labelFor(CALIBRATION_RESULT_OPTIONS, row.result, t)}
        </Badge>
      ),
    },
    {
      key: 'provider',
      headerKey: 'lab.provider',
      text: (row) => row.provider ?? '',
    },
    {
      key: 'certificateNo',
      headerKey: 'lab.certificateNo',
      text: (row) => row.certificateNo ?? '',
    },
    {
      key: 'actions',
      headerKey: 'lab.actions',
      className: 'w-40',
      render: (row) => (
        <div className='flex justify-end'>
          <Button
            size='sm'
            variant='ghost'
            onClick={() => setCertificateOf(row)}
          >
            <PaperclipIcon />
            {t('lab.attachments')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center justify-between gap-2 text-base'>
          {t(titleKey)}
          <span className='flex items-center gap-2'>
            <Button
              size='sm'
              variant='ghost'
              onClick={list.reload}
              disabled={list.loading}
            >
              <RefreshCw />
              {t('lab.refresh')}
            </Button>
            {canWrite ? (
              <Button size='sm' onClick={() => setCreating(true)}>
                <PlusIcon />
                {t('lab.createCalibration')}
              </Button>
            ) : null}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {message ? (
          <Alert variant='destructive'>
            <AlertTitle>{t('lab.loadFailed')}</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
        <DataTable
          columns={columns}
          emptyKey='lab.noCalibrations'
          loading={list.loading}
          rowKey={(row) => row.id}
          rows={list.data ?? []}
        />
        {certificateOf ? (
          <div className='border-border rounded-lg border p-4'>
            <div className='mb-3 flex items-center justify-between gap-2'>
              <p className='text-sm font-medium'>
                {t('lab.filesOf', {
                  name: certificateOf.certificateNo ?? `#${certificateOf.id}`,
                })}
              </p>
              <Button
                size='sm'
                variant='ghost'
                onClick={() => setCertificateOf(null)}
              >
                {t('lab.close')}
              </Button>
            </div>
            <LabFileManager
              canWrite={canWrite}
              targetId={certificateOf.id}
              targetType='calibration'
            />
          </div>
        ) : null}
      </CardContent>

      {creating ? (
        <FormDialog
          descriptionKey='lab.createCalibrationHint'
          fields={fields}
          onClose={() => setCreating(false)}
          onSubmit={async (values) => {
            await api.createCalibration({
              ...values,
              equipmentId: equipmentId ?? values.equipmentId,
            });
            setCreating(false);
            list.reload();
          }}
          titleKey='lab.createCalibration'
        />
      ) : null}
    </Card>
  );
}
