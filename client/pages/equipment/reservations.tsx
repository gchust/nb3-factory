import { useTranslation } from '@nocobase/i18n/client';
import { CalendarPlusIcon, RefreshCw } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { DataTable, type DataTableColumn } from '@/components/data-table';
import { FormDialog } from '@/components/form-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLabApi } from '@/lib/lab-api';
import { useLabErrorMessage } from '@/lib/lab-errors';
import { formatMoment } from '@/lib/lab-format';
import type { FormFieldSpec } from '@/lib/lab-form';
import { labelFor } from '@/lib/lab-options';
import { statusTone } from '@/lib/lab-status';
import {
  RESERVATION_STATUS_OPTIONS,
  type ReservationView,
} from '@/lib/lab-types';
import {
  toLabRequestError,
  useAsync,
  type LabRequestError,
} from '@/lib/use-async';

const RESERVATION_FIELDS: readonly FormFieldSpec[] = [
  {
    name: 'startsAt',
    labelKey: 'lab.startsAt',
    kind: 'datetime',
    required: true,
  },
  { name: 'endsAt', labelKey: 'lab.endsAt', kind: 'datetime', required: true },
  { name: 'purpose', labelKey: 'lab.purpose', kind: 'textarea', full: true },
];

export interface EquipmentReservationsProps {
  readonly equipmentId: number;
  /** Whether the viewer may book this instrument at all. */
  readonly canReserve: boolean;
  /** Whether the viewer may cancel somebody else's booking. */
  readonly canCancelAny: boolean;
  readonly currentUserId: string | undefined;
}

/**
 * Bookings for one instrument.
 *
 * A reservation is refused by the server for all the reasons the business cares about — expired
 * calibration, an unresolved safety issue, a clash with another booking — so this panel offers the
 * form and shows the server's answer rather than pre-computing those rules a second time.
 */
export function EquipmentReservations({
  equipmentId,
  canReserve,
  canCancelAny,
  currentUserId,
}: EquipmentReservationsProps): ReactElement {
  const { t } = useTranslation();
  const api = useLabApi();
  const list = useAsync(`reservations:${equipmentId}`, () =>
    api.reservations({ equipmentId }),
  );
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState<ReservationView | null>(null);
  const [actionError, setActionError] = useState<LabRequestError | null>(null);
  const message = useLabErrorMessage(list.error);
  const actionMessage = useLabErrorMessage(actionError);

  const cancel = async (reservation: ReservationView) => {
    setActionError(null);
    try {
      await api.cancelReservation(reservation.id);
      setCancelling(null);
      list.reload();
    } catch (thrown) {
      setActionError(toLabRequestError(thrown));
    }
  };

  const isOwner = (reservation: ReservationView): boolean =>
    currentUserId !== undefined && reservation.userId === currentUserId;

  const columns: DataTableColumn<ReservationView>[] = [
    {
      key: 'startsAt',
      headerKey: 'lab.startsAt',
      text: (row) => row.startsAt ?? '',
      render: (row) => formatMoment(t, row.startsAt),
    },
    {
      key: 'endsAt',
      headerKey: 'lab.endsAt',
      text: (row) => row.endsAt ?? '',
      render: (row) => formatMoment(t, row.endsAt),
    },
    {
      key: 'purpose',
      headerKey: 'lab.purpose',
      text: (row) => row.purpose ?? '',
    },
    {
      key: 'status',
      headerKey: 'lab.status',
      text: (row) => row.status,
      render: (row) => (
        <Badge variant={statusTone(row.status)}>
          {labelFor(RESERVATION_STATUS_OPTIONS, row.status, t)}
        </Badge>
      ),
    },
    {
      key: 'actions',
      headerKey: 'lab.actions',
      className: 'w-32',
      render: (row) =>
        (isOwner(row) || canCancelAny) &&
        !['completed', 'cancelled'].includes(row.status) ? (
          <div className='flex justify-end'>
            <Button
              size='sm'
              variant='outline'
              onClick={() => setCancelling(row)}
            >
              {t('lab.cancelReservation')}
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center justify-between gap-2 text-base'>
          {t('lab.reservations')}
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
            {canReserve ? (
              <Button size='sm' onClick={() => setCreating(true)}>
                <CalendarPlusIcon />
                {t('lab.createReservation')}
              </Button>
            ) : null}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        {message ? (
          <Alert variant='destructive'>
            <AlertTitle>{t('lab.loadFailed')}</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
        {actionMessage ? (
          <Alert variant='destructive'>
            <AlertDescription>{actionMessage}</AlertDescription>
          </Alert>
        ) : null}
        <DataTable
          columns={columns}
          emptyKey='lab.noReservations'
          loading={list.loading}
          rowKey={(row) => row.id}
          rows={list.data ?? []}
        />
      </CardContent>

      {creating ? (
        <FormDialog
          descriptionKey='lab.createReservationHint'
          fields={RESERVATION_FIELDS}
          onClose={() => setCreating(false)}
          onSubmit={async (values) => {
            await api.createReservation({ ...values, equipmentId });
            setCreating(false);
            list.reload();
          }}
          titleKey='lab.createReservation'
        />
      ) : null}

      {cancelling ? (
        <FormDialog
          destructive
          fields={[]}
          onClose={() => setCancelling(null)}
          onSubmit={async () => {
            await cancel(cancelling);
          }}
          submitKey='lab.confirmCancel'
          titleKey='lab.cancelReservationConfirm'
        />
      ) : null}
    </Card>
  );
}
