import { useApiClient, useToaster, type ApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  useCallback,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';
import { useParams } from 'react-router';

import { completeInspection, getInspection, listDevices } from '@/api/service';
import { INSPECTION_RESULTS, type InspectionResult } from '@/api/service-types';
import { RouteDialog } from '@/components/route-dialog';
import { ServiceErrorNotice } from '@/components/service/feedback';
import { DetailItem, DetailList } from '@/components/service/detail-list';
import { FormField, SelectControl } from '@/components/service/form-field';
import { useServiceOutlet } from '@/components/service/outlet-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { useServiceResource } from '@/hooks/use-service-resource';

const FORM_ID = 'inspection-complete-form';

/**
 * Record an inspection result.
 *
 * The result code is required and free form on purpose: it is the field an
 * engineer reads back later, and a fixed choice list would lose the machine's
 * own reading. The optional next date is the one manual override of the
 * device's scheduled interval.
 *
 * `useRouteOverlay()` may only be called inside the overlay, so this page owns
 * only the submit state and returns `RouteDialog`; the form body and the footer
 * buttons are components rendered inside it.
 */
export default function CompleteInspectionPage(): ReactElement {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      beforeClose={() => !submittingRef.current}
      footer={<CompleteInspectionFooter submitting={submitting} />}
      title={t('service.inspections.completeTitle')}
    >
      <CompleteInspectionBody onSubmittingChange={handleSubmittingChange} />
    </RouteDialog>
  );
}

function CompleteInspectionBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const { inspectionId } = useParams();
  const id = Number(inspectionId);
  const { close } = useRouteOverlay();
  const { reload: reloadList } = useServiceOutlet();

  const [result, setResult] = useState<InspectionResult>('normal');
  const [resultCode, setResultCode] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(
    async (client: ApiClient, signal: AbortSignal) => {
      const [inspection, devices] = await Promise.all([
        getInspection(client, id, signal),
        listDevices(client, {}, signal),
      ]);
      return { inspection, devices: devices.data };
    },
    [id],
  );
  const detail = useServiceResource(`service-inspection:${String(id)}`, load);

  const device = (detail.data?.devices ?? []).find(
    (row) => row.id === detail.data?.inspection.deviceId,
  );

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (resultCode.trim() === '') return;
    onSubmittingChange(true);
    setError(null);
    try {
      await completeInspection(api, id, {
        result,
        resultCode: resultCode.trim(),
        nextDate: nextDate ? new Date(nextDate).toISOString() : null,
      });
      toaster.show({
        type: 'success',
        title: t('service.inspections.completed'),
      });
      reloadList();
      await close();
    } catch (submitError) {
      setError(submitError);
    } finally {
      onSubmittingChange(false);
    }
  }

  return (
    <>
      {detail.error ? (
        <ServiceErrorNotice error={detail.error} onRetry={detail.reload} />
      ) : null}
      {error ? <ServiceErrorNotice error={error} /> : null}
      {detail.isPending ? (
        <div className='flex items-center gap-2 text-sm text-muted-foreground'>
          <Spinner aria-hidden='true' />
          {t('service.common.loading')}
        </div>
      ) : (
        <div className='grid gap-4'>
          <DetailList>
            <DetailItem label={t('service.devices.title')}>
              {device === undefined
                ? String(detail.data?.inspection.deviceId ?? '')
                : `${device.code} · ${device.name}`}
            </DetailItem>
            <DetailItem label={t('service.inspections.plannedDate')}>
              {detail.data?.inspection.plannedDate}
            </DetailItem>
          </DetailList>
          <form
            className='grid gap-4'
            id={FORM_ID}
            onSubmit={(event) => void submit(event)}
          >
            <FormField
              htmlFor='inspection-result'
              label={t('service.inspections.result')}
              required
            >
              <SelectControl
                id='inspection-result'
                onChange={(value) => {
                  setResult(
                    (INSPECTION_RESULTS as readonly string[]).includes(value)
                      ? (value as InspectionResult)
                      : 'normal',
                  );
                }}
                options={INSPECTION_RESULTS.map((value) => ({
                  value,
                  label: t(`service.inspectionResult.${value}`),
                }))}
                value={result}
              />
            </FormField>
            <FormField
              htmlFor='inspection-result-code'
              label={t('service.inspections.resultCode')}
              required
            >
              <Input
                id='inspection-result-code'
                onChange={(event) => {
                  setResultCode(event.target.value);
                }}
                required
                value={resultCode}
              />
            </FormField>
            <FormField
              htmlFor='inspection-next'
              label={t('service.inspections.nextDate')}
            >
              <Input
                id='inspection-next'
                onChange={(event) => {
                  setNextDate(event.target.value);
                }}
                type='datetime-local'
                value={nextDate}
              />
            </FormField>
          </form>
        </div>
      )}
    </>
  );
}

function CompleteInspectionFooter({
  submitting,
}: {
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <>
      <Button
        disabled={submitting}
        onClick={() => {
          void close();
        }}
        type='button'
        variant='ghost'
      >
        {t('service.actions.cancel')}
      </Button>
      <Button disabled={submitting} form={FORM_ID} type='submit'>
        {submitting ? <Spinner aria-hidden='true' /> : null}
        {t('service.inspections.completeAction')}
      </Button>
    </>
  );
}
