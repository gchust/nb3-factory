import { useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { apiClientToken, useService } from '@nocobase/app-client';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeftIcon, ClipboardCheckIcon, PlusIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AsyncSection } from '@/components/production/async-section';
import { WorkOrderStatusBadge } from '@/components/production/status-badge';
import { ReportFormDialog } from '@/components/production/report-form';
import { DefectFormDialog } from '@/components/production/defect-form';
import { SelectField } from '@/components/production/select-field';
import {
  productionApi,
  type ActorInfo,
  type Product,
  type WorkOrderDetail,
  type WorkOrderStatus,
  type WorkReport,
} from '@/lib/production-api';
import { errorCodeOf } from '@/lib/production-messages';
import { useAsync } from '@/lib/use-async';

interface DetailData {
  actor: ActorInfo;
  detail: WorkOrderDetail;
  products: Product[];
}

const STATUSES: readonly WorkOrderStatus[] = [
  'pending',
  'in_production',
  'completed',
  'closed',
];

function isWorkOrderStatus(value: string): value is WorkOrderStatus {
  return (STATUSES as readonly string[]).includes(value);
}

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

export default function WorkOrderDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useService(apiClientToken);
  const navigate = useNavigate();
  const params = useParams();
  const workOrderId = Number(params.id);
  const [reportOpen, setReportOpen] = useState(false);
  const [defectReport, setDefectReport] = useState<WorkReport | null>(null);

  const state = useAsync<DetailData>(async () => {
    const [actor, detail, products] = await Promise.all([
      productionApi.me(api),
      productionApi.workOrder(api, workOrderId),
      productionApi.products(api),
    ]);
    return { actor, detail, products };
  }, `work-order-${workOrderId}`);

  const standardMinutes = useMemo(() => {
    const product = state.data?.products.find(
      (candidate) => candidate.id === state.data?.detail.productId,
    );
    return product?.standardMinutes ?? 0;
  }, [state.data]);

  return (
    <section className='mx-auto w-full max-w-6xl space-y-6 p-6'>
      <div>
        <Button
          onClick={() => {
            void navigate('/work-orders');
          }}
          size='sm'
          variant='ghost'
        >
          <ArrowLeftIcon />
          {t('production.workOrders.backToList')}
        </Button>
      </div>

      <AsyncSection
        denied={errorCodeOf(state.error) === 'FORBIDDEN'}
        error={state.error}
        onRetry={() => void state.reload()}
        status={state.status}
      >
        {state.data ? (
          <>
            <header className='flex flex-wrap items-start justify-between gap-4'>
              <div className='space-y-1'>
                <div className='flex items-center gap-2'>
                  <h1 className='font-heading text-2xl font-semibold tracking-tight'>
                    {state.data.detail.code}
                  </h1>
                  <WorkOrderStatusBadge status={state.data.detail.status} />
                </div>
                <p className='text-sm text-muted-foreground'>
                  {state.data.detail.productName} · {state.data.detail.teamName}{' '}
                  · {t('production.workOrders.plannedQuantity')}{' '}
                  {state.data.detail.plannedQuantity}{' '}
                  {state.data.detail.productUnit}
                </p>
                <p className='text-sm text-muted-foreground'>
                  {t('production.workOrders.plannedStartDate')}:{' '}
                  {state.data.detail.plannedStartDate ?? '-'} ·{' '}
                  {t('production.workOrders.plannedEndDate')}:{' '}
                  {state.data.detail.plannedEndDate ?? '-'}
                </p>
              </div>
              <div className='flex flex-wrap items-center gap-2'>
                {state.data.actor.capabilities.canReport ? (
                  <Button onClick={() => setReportOpen(true)}>
                    <ClipboardCheckIcon />
                    {t('production.workOrders.reportAction')}
                  </Button>
                ) : null}
                {state.data.actor.capabilities.canManageWorkOrders ? (
                  <div className='w-40'>
                    <SelectField
                      onValueChange={(value) => {
                        if (isWorkOrderStatus(value)) {
                          void productionApi
                            .updateWorkOrderStatus(
                              api,
                              state.data?.detail.id ?? workOrderId,
                              value,
                            )
                            .then(() => state.reload());
                        }
                      }}
                      options={STATUSES.map((status) => ({
                        value: status,
                        label: t(`production.status.${status}`, {
                          defaultValue: status,
                        }),
                      }))}
                      value={state.data.detail.status}
                    />
                  </div>
                ) : null}
              </div>
            </header>

            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
              <SummaryCard
                label={t('production.workOrders.reported')}
                value={state.data.detail.reportedQuantity}
              />
              <SummaryCard
                label={t('production.workOrders.qualified')}
                value={state.data.detail.qualifiedQuantity}
              />
              <SummaryCard
                label={t('production.workOrders.defect')}
                value={state.data.detail.defectQuantity}
              />
              <SummaryCard
                label={t('production.workOrders.completion')}
                value={`${state.data.detail.completion}%`}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>
                  {t('production.workOrders.processesTitle')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        {t('production.workOrders.sequence')}
                      </TableHead>
                      <TableHead>
                        {t('production.workOrders.processName')}
                      </TableHead>
                      <TableHead className='text-right'>
                        {t('production.workOrders.plannedQuantity')}
                      </TableHead>
                      <TableHead className='text-right'>
                        {t('production.workOrders.reported')}
                      </TableHead>
                      <TableHead className='text-right'>
                        {t('production.workOrders.qualified')}
                      </TableHead>
                      <TableHead className='text-right'>
                        {t('production.workOrders.defect')}
                      </TableHead>
                      <TableHead className='text-right'>
                        {t('production.workOrders.completion')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {state.data.detail.processes.map((process) => (
                      <TableRow key={process.id}>
                        <TableCell>{process.sequence}</TableCell>
                        <TableCell className='font-medium'>
                          {process.name}
                        </TableCell>
                        <TableCell className='text-right'>
                          {process.plannedQuantity}
                        </TableCell>
                        <TableCell className='text-right'>
                          {process.reportedQuantity}
                        </TableCell>
                        <TableCell className='text-right'>
                          {process.qualifiedQuantity}
                        </TableCell>
                        <TableCell className='text-right'>
                          {process.defectQuantity}
                        </TableCell>
                        <TableCell className='text-right'>
                          {process.completion}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('production.workOrders.reportsTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                {state.data.detail.reports.length === 0 ? (
                  <p className='py-4 text-center text-sm text-muted-foreground'>
                    {t('production.common.empty')}
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          {t('production.workOrders.processName')}
                        </TableHead>
                        <TableHead className='text-right'>
                          {t('production.workOrders.reportQuantity')}
                        </TableHead>
                        <TableHead className='text-right'>
                          {t('production.workOrders.qualifiedQuantity')}
                        </TableHead>
                        <TableHead className='text-right'>
                          {t('production.workOrders.defectQuantity')}
                        </TableHead>
                        <TableHead className='text-right'>
                          {t('production.workOrders.hours')}
                        </TableHead>
                        <TableHead>
                          {t('production.workOrders.reporter')}
                        </TableHead>
                        <TableHead>
                          {t('production.workOrders.reportedAt')}
                        </TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {state.data.detail.reports.map((report) => {
                        const remaining =
                          report.defectQuantity -
                          report.registeredDefectQuantity;
                        const canRegister =
                          state.data?.actor.capabilities.canManageDefects &&
                          remaining > 0;
                        return (
                          <TableRow key={report.id}>
                            <TableCell>{report.processName}</TableCell>
                            <TableCell className='text-right'>
                              {report.quantity}
                            </TableCell>
                            <TableCell className='text-right'>
                              {report.qualifiedQuantity}
                            </TableCell>
                            <TableCell className='text-right'>
                              {report.defectQuantity}
                            </TableCell>
                            <TableCell className='text-right'>
                              {report.hours.toFixed(1)}
                            </TableCell>
                            <TableCell>{report.reporterName}</TableCell>
                            <TableCell>
                              {formatDateTime(report.reportedAt)}
                            </TableCell>
                            <TableCell className='text-right'>
                              {canRegister ? (
                                <Button
                                  onClick={() => setDefectReport(report)}
                                  size='sm'
                                  variant='outline'
                                >
                                  <PlusIcon />
                                  {t('production.workOrders.registerDefect')}
                                </Button>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('production.workOrders.defectsTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                {state.data.detail.defects.length === 0 ? (
                  <p className='py-4 text-center text-sm text-muted-foreground'>
                    {t('production.common.empty')}
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          {t('production.workOrders.processName')}
                        </TableHead>
                        <TableHead className='text-right'>
                          {t('production.workOrders.defectQuantity')}
                        </TableHead>
                        <TableHead>
                          {t('production.workOrders.defectReason')}
                        </TableHead>
                        <TableHead>
                          {t('production.workOrders.defectDisposition')}
                        </TableHead>
                        <TableHead>
                          {t('production.workOrders.recordedBy')}
                        </TableHead>
                        <TableHead>
                          {t('production.workOrders.reportedAt')}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {state.data.detail.defects.map((defect) => (
                        <TableRow key={defect.id}>
                          <TableCell>{defect.processName}</TableCell>
                          <TableCell className='text-right'>
                            {defect.quantity}
                          </TableCell>
                          <TableCell>
                            {t(`production.reason.${defect.reason}`, {
                              defaultValue: defect.reason,
                            })}
                          </TableCell>
                          <TableCell>
                            {t(`production.disposition.${defect.disposition}`, {
                              defaultValue: defect.disposition,
                            })}
                          </TableCell>
                          <TableCell>{defect.recordedByName}</TableCell>
                          <TableCell>
                            {formatDateTime(defect.createdAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <ReportFormDialog
              api={api}
              onCreated={() => void state.reload()}
              onOpenChange={setReportOpen}
              open={reportOpen}
              processes={state.data.detail.processes}
              standardMinutes={standardMinutes}
              workOrderId={state.data.detail.id}
            />
            <DefectFormDialog
              api={api}
              onCreated={() => {
                setDefectReport(null);
                void state.reload();
              }}
              onOpenChange={(open) => {
                if (!open) setDefectReport(null);
              }}
              open={defectReport !== null}
              report={defectReport}
              workOrderId={state.data.detail.id}
            />
          </>
        ) : null}
      </AsyncSection>
    </section>
  );
}

function SummaryCard({
  label,
  value,
}: {
  readonly label: string;
  readonly value: number | string;
}): ReactElement {
  return (
    <Card>
      <CardContent className='pt-6'>
        <p className='text-sm text-muted-foreground'>{label}</p>
        <p className='mt-1 text-2xl font-semibold'>{value}</p>
      </CardContent>
    </Card>
  );
}
