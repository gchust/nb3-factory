import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { CheckCircle2Icon } from 'lucide-react';
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useState,
} from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDrawer } from '@/components/route-drawer';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';

import { InspectionStatusBadge } from '../components/service-badges.js';
import {
  DateText,
  DateTimeText,
  LoadError,
  TableSkeleton,
} from '../components/service-states.js';
import { errorMessage } from '../service-api.js';
import {
  useAsync,
  useServiceApi,
  useServicePermission,
} from '../service-hooks.js';
import { INSPECTION_RESULTS } from '../types.js';
import type { InspectionsOutletContext } from './context.js';

/** One inspection plan, and the form that records its outcome. */
export default function InspectionDetailPage(): ReactElement {
  const { t } = useTranslation();
  const { inspectionId } = useParams<{ inspectionId: string }>();
  return (
    <RouteDrawer
      title={t('service.inspectionDetail.title')}
      description={t('service.inspectionDetail.description')}
    >
      <InspectionDetailBody inspectionId={Number(inspectionId)} />
    </RouteDrawer>
  );
}

function InspectionDetailBody({
  inspectionId,
}: {
  readonly inspectionId: number;
}): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const { reload } = useOutletContext<InspectionsOutletContext>();
  const inspection = useAsync(
    () => api.getInspection(inspectionId),
    `inspection:${inspectionId}`,
  );

  if (inspection.error) {
    return <LoadError error={inspection.error} onRetry={inspection.reload} />;
  }
  if (inspection.loading || !inspection.data) {
    return <TableSkeleton rows={5} columns={2} />;
  }

  const detail = inspection.data;

  return (
    <div className='flex flex-col gap-6'>
      <header className='flex flex-col gap-2'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='font-mono text-sm text-muted-foreground'>
            {detail.code}
          </span>
          <InspectionStatusBadge value={detail.status} />
        </div>
        <h2 className='font-heading text-lg font-medium'>{detail.title}</h2>
      </header>

      <dl className='grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2'>
        <Info
          label={t('service.ticket.customer')}
          value={detail.customerName}
        />
        <Info label={t('service.ticket.device')} value={detail.deviceName} />
        <Info
          label={t('service.inspection.assignee')}
          value={detail.assigneeName ?? t('service.inspection.unassigned')}
        />
        <Info
          label={t('service.inspection.scheduledDate')}
          value={<DateText value={detail.scheduledDate} />}
        />
        <Info
          label={t('service.inspection.completedAt')}
          value={<DateTimeText value={detail.completedAt} />}
        />
        <Info
          label={t('service.inspection.result')}
          value={
            detail.result
              ? t(`service.inspectionResult.${detail.result}`, {
                  defaultValue: detail.result,
                })
              : '—'
          }
        />
      </dl>

      {detail.findings ? (
        <section className='flex flex-col gap-2'>
          <h3 className='font-heading text-sm font-medium'>
            {t('service.inspection.findings')}
          </h3>
          <p className='rounded-lg border bg-muted/40 p-3 text-sm whitespace-pre-wrap'>
            {detail.findings}
          </p>
        </section>
      ) : null}

      {detail.status === 'completed' ? (
        <p className='text-sm text-muted-foreground'>
          {t('service.inspectionDetail.completed')}
        </p>
      ) : (
        <CompleteForm
          inspectionId={inspectionId}
          onDone={() => {
            inspection.reload();
            reload();
          }}
        />
      )}
    </div>
  );
}

function Info({
  label,
  value,
}: {
  readonly label: string;
  readonly value: ReactNode;
}): ReactElement {
  return (
    <div className='flex flex-col gap-0.5'>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='text-sm'>
        {value ?? <span className='text-muted-foreground'>—</span>}
      </dd>
    </div>
  );
}

function CompleteForm({
  inspectionId,
  onDone,
}: {
  readonly inspectionId: number;
  readonly onDone: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const toaster = useToaster();
  const canComplete = useServicePermission('service.inspections', 'complete');
  const [result, setResult] = useState('normal');
  const [findings, setFindings] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async () => {
    setBusy(true);
    try {
      await api.completeInspection(inspectionId, {
        result,
        findings: findings.trim() ? findings.trim() : null,
      });
      toaster.show({
        type: 'success',
        title: t('service.inspectionDetail.completed'),
      });
      onDone();
    } catch (error) {
      toaster.show({
        type: 'error',
        title: t('service.inspectionDetail.completeFailed'),
        description: errorMessage(error),
      });
    } finally {
      setBusy(false);
    }
  }, [api, findings, inspectionId, onDone, result, t, toaster]);

  if (!canComplete) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('service.inspectionDetail.noPermission')}
      </p>
    );
  }

  return (
    <section className='flex flex-col gap-3 rounded-lg border p-4'>
      <h3 className='font-heading text-sm font-medium'>
        {t('service.inspectionDetail.recordResult')}
      </h3>
      <div className='flex flex-col gap-2'>
        <Label htmlFor='inspection-result'>
          {t('service.inspection.result')}
        </Label>
        <NativeSelect
          id='inspection-result'
          className='w-full'
          value={result}
          onChange={(event) => setResult(event.target.value)}
        >
          {INSPECTION_RESULTS.map((value) => (
            <option key={value} value={value}>
              {t(`service.inspectionResult.${value}`, { defaultValue: value })}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className='flex flex-col gap-2'>
        <Label htmlFor='inspection-findings'>
          {t('service.inspection.findings')}
        </Label>
        <Textarea
          id='inspection-findings'
          rows={3}
          value={findings}
          onChange={(event) => setFindings(event.target.value)}
        />
      </div>
      <div className='flex justify-end'>
        <Button disabled={busy} onClick={() => void submit()}>
          <CheckCircle2Icon />
          {t('service.inspectionDetail.submitResult')}
        </Button>
      </div>
    </section>
  );
}
