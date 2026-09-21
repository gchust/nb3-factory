import { useTranslation } from '@nocobase/i18n/client';
import { RefreshCw } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useParams } from 'react-router';

import { Breadcrumbs } from '@/components/breadcrumbs';
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
import { formatMoment } from '@/lib/lab-format';
import type { FormFieldSpec } from '@/lib/lab-form';
import { labelFor, ROLE_LABEL_KEYS } from '@/lib/lab-options';
import { availableWorkOrderActions, canWriteIn } from '@/lib/lab-permissions';
import { statusTone } from '@/lib/lab-status';
import {
  WORK_ORDER_PRIORITY_OPTIONS,
  WORK_ORDER_STATUS_OPTIONS,
  WORK_ORDER_TYPE_OPTIONS,
  type WorkOrderEventView,
} from '@/lib/lab-types';
import { useAsync } from '@/lib/use-async';

/** The fields a transition asks for; only `assign` needs more than a comment. */
function transitionFields(
  action: string,
  assignees: readonly { value: string; label: string }[],
): FormFieldSpec[] {
  const fields: FormFieldSpec[] = [];
  if (action === 'assign') {
    fields.push({
      name: 'assigneeId',
      labelKey: 'lab.assignee',
      kind: 'select',
      required: true,
      options: assignees,
    });
  }
  fields.push({
    name: 'comment',
    labelKey: 'lab.comment',
    kind: 'textarea',
    full: true,
    required: action === 'complete' || action === 'reject',
    helpKey:
      action === 'complete' || action === 'reject'
        ? 'lab.reviewCommentHint'
        : undefined,
  });
  return fields;
}

/** One maintenance request: what it is, who has it, and what has happened to it. */
export default function WorkOrderDetailPage(): ReactElement {
  const { t } = useTranslation();
  const params = useParams<{ workOrderId: string }>();
  const workOrderId = Number(params.workOrderId);
  const api = useLabApi();
  const [action, setAction] = useState<string | null>(null);
  const state = useAsync(`work-order:${workOrderId}`, async () => {
    const workOrder = await api.workOrder(workOrderId);
    const [access, members] = await Promise.all([
      api.access(),
      api.labMembers(workOrder.labId).catch(() => []),
    ]);
    return { workOrder, access, members };
  });
  const message = useLabErrorMessage(state.error);
  const workOrder = state.data?.workOrder;
  const access = state.data?.access;
  const members = state.data?.members ?? [];

  const assignees = members
    .filter((member) => member.role !== 'student')
    .map((member) => ({
      value: member.userId,
      label: `${member.name ?? member.email ?? member.userId} · ${t(ROLE_LABEL_KEYS[member.role])}`,
    }));

  const nameOf = (userId: string | null): string => {
    if (!userId) return t('lab.unset');
    const member = members.find((row) => row.userId === userId);
    return member?.name ?? member?.email ?? userId;
  };

  const actions = workOrder
    ? availableWorkOrderActions(access, workOrder.labId, workOrder.status)
    : [];
  const canWriteFiles = workOrder
    ? canWriteIn(access, workOrder.labId, ['lab_admin', 'technician'])
    : false;

  const items: DetailItem[] = workOrder
    ? [
        { label: t('lab.code'), value: workOrder.code },
        {
          label: t('lab.laboratory'),
          value: workOrder.labName ?? t('lab.unset'),
        },
        {
          label: t('lab.equipment'),
          value:
            `${workOrder.assetNo ?? ''} ${workOrder.equipmentName ?? ''}`.trim() ||
            t('lab.unset'),
        },
        {
          label: t('lab.status'),
          value: (
            <Badge variant={statusTone(workOrder.status)}>
              {labelFor(WORK_ORDER_STATUS_OPTIONS, workOrder.status, t)}
            </Badge>
          ),
        },
        {
          label: t('lab.workOrderType'),
          value: labelFor(WORK_ORDER_TYPE_OPTIONS, workOrder.type, t),
        },
        {
          label: t('lab.priority'),
          value: (
            <Badge variant={statusTone(workOrder.priority)}>
              {labelFor(WORK_ORDER_PRIORITY_OPTIONS, workOrder.priority, t)}
            </Badge>
          ),
        },
        { label: t('lab.assignee'), value: nameOf(workOrder.assigneeId) },
        { label: t('lab.createdBy'), value: nameOf(workOrder.createdById) },
        {
          label: t('lab.createdAt'),
          value: formatMoment(t, workOrder.createdAt),
        },
        {
          label: t('lab.resolvedAt'),
          value: formatMoment(t, workOrder.resolvedAt),
        },
        { label: t('lab.reviewedBy'), value: nameOf(workOrder.reviewedById) },
        {
          label: t('lab.reviewComment'),
          value: workOrder.reviewComment ?? t('lab.unset'),
        },
        {
          label: t('lab.faultDescription'),
          value: workOrder.description ?? t('lab.unset'),
        },
      ]
    : [];

  return (
    <RouteChildPage>
      <PageContainer className='mx-auto max-w-5xl'>
        <Breadcrumbs />
        <PageHeader
          actions={
            <Button
              variant='outline'
              onClick={state.reload}
              disabled={state.loading}
            >
              <RefreshCw />
              {t('lab.refresh')}
            </Button>
          }
          description={workOrder ? workOrder.code : undefined}
          title={workOrder ? workOrder.title : t('workOrders.detailTitle')}
        />

        {message ? (
          <Alert variant='destructive'>
            <AlertTitle>{t('lab.loadFailed')}</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}

        {state.loading && !workOrder ? (
          <Skeleton className='h-40 w-full' />
        ) : null}

        {workOrder ? (
          <>
            {actions.length > 0 ? (
              <div className='flex flex-wrap gap-2'>
                {actions.map((candidate) => (
                  <Button
                    key={candidate}
                    variant={
                      candidate === 'cancel' || candidate === 'reject'
                        ? 'outline'
                        : 'default'
                    }
                    onClick={() => setAction(candidate)}
                  >
                    {t(`lab.workOrderAction.${candidate}`)}
                  </Button>
                ))}
              </div>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle className='text-base'>{t('lab.record')}</CardTitle>
              </CardHeader>
              <CardContent>
                <DetailGrid items={items} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className='text-base'>{t('lab.timeline')}</CardTitle>
              </CardHeader>
              <CardContent>
                {(workOrder.events ?? []).length === 0 ? (
                  <p className='text-muted-foreground text-sm'>
                    {t('workOrders.noEvents')}
                  </p>
                ) : (
                  <ol className='flex flex-col gap-4'>
                    {(workOrder.events ?? []).map((event) => (
                      <EventRow event={event} key={event.id} nameOf={nameOf} />
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className='text-base'>
                  {t('lab.attachments')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <LabFileManager
                  canWrite={canWriteFiles}
                  targetId={workOrder.id}
                  targetType='work_order'
                />
              </CardContent>
            </Card>
          </>
        ) : null}
      </PageContainer>

      {action && workOrder ? (
        <FormDialog
          descriptionKey='lab.transitionHint'
          fields={transitionFields(action, assignees)}
          onClose={() => setAction(null)}
          onSubmit={async (values) => {
            await api.transitionWorkOrder(workOrder.id, { ...values, action });
            setAction(null);
            state.reload();
          }}
          submitKey={`lab.workOrderAction.${action}`}
          titleKey={`lab.workOrderAction.${action}`}
        />
      ) : null}
    </RouteChildPage>
  );
}

function EventRow({
  event,
  nameOf,
}: {
  readonly event: WorkOrderEventView;
  readonly nameOf: (userId: string | null) => string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <li className='border-border flex flex-col gap-1 border-l-2 pl-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <span className='text-sm font-medium'>
          {t(`lab.workOrderAction.${event.action}`)}
        </span>
        {event.fromStatus && event.toStatus ? (
          <span className='text-muted-foreground text-xs'>
            {labelFor(WORK_ORDER_STATUS_OPTIONS, event.fromStatus, t)} →{' '}
            {labelFor(WORK_ORDER_STATUS_OPTIONS, event.toStatus, t)}
          </span>
        ) : null}
        <span className='text-muted-foreground text-xs'>
          {formatMoment(t, event.createdAt)}
        </span>
      </div>
      <span className='text-muted-foreground text-xs'>
        {nameOf(event.actorId)}
      </span>
      {event.comment ? (
        <p className='text-sm break-words'>{event.comment}</p>
      ) : null}
    </li>
  );
}
