/**
 * Inspections — the preventive half of the collaboration.
 *
 * Tasks are generated from the equipment register and are started and completed
 * by the accountable engineer. An engineer only ever sees their own tasks: the
 * server scopes the list, and this page shows the same list it is given.
 *
 * The plans that generate those tasks and send the overdue reminders belong to a
 * supervisor, so they appear here with their real state and execution records,
 * and only a supervisor is offered the switch and the run button.
 */
import { type ReactElement, useCallback, useState } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { CheckCircle2Icon, PlayIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

import { useServiceApi, type ServiceList } from './api.js';
import { formText, formatDateTime, useLoad } from './data.js';
import { ExecutionPlansCard } from './execution-plans.js';
import {
  EmptyState,
  LoadFailure,
  Loading,
  Pagination,
  ServicePage,
  StatusBadge,
} from './parts.js';
import type { InspectionView, MeView } from './types.js';

const STATUSES = ['pending', 'in_progress', 'done', 'overdue'];

export default function InspectionsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [completing, setCompleting] = useState<InspectionView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const me = useLoad(useCallback(() => api.get<MeView>('/me'), [api]));
  const isManager = me.data?.roles.includes('manager') ?? false;

  const state = useLoad(
    useCallback(
      () =>
        api.get<ServiceList<InspectionView>>('/inspections', {
          status,
          page,
          pageSize: 20,
        }),
      [api, status, page],
    ),
  );

  const act = async (
    label: string,
    run: () => Promise<unknown>,
  ): Promise<void> => {
    setBusy(label);
    try {
      await run();
      state.reload();
    } catch (error) {
      api.report(error);
    } finally {
      setBusy(null);
    }
  };

  return (
    <ServicePage
      title={t('service.inspections.title')}
      description={t('service.inspections.description')}
    >
      {isManager ? <ExecutionPlansCard /> : null}

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>
            {t('service.inspections.filters')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='max-w-xs space-y-1.5'>
            <Label htmlFor='inspection-status'>
              {t('service.inspections.status')}
            </Label>
            <Select
              value={status || 'all'}
              onValueChange={(value) => {
                setPage(1);
                setStatus(value === 'all' ? '' : String(value));
              }}
            >
              <SelectTrigger id='inspection-status' className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>{t('service.common.all')}</SelectItem>
                {STATUSES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {t(`service.status.${item}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {state.loading ? <Loading /> : null}
      {state.error ? (
        <LoadFailure message={state.error} onRetry={() => state.reload()} />
      ) : null}
      {state.data ? (
        <Card>
          <CardContent className='space-y-4 pt-6'>
            {state.data.rows.length === 0 ? (
              <EmptyState message={t('service.inspections.empty')} />
            ) : (
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('service.inspections.taskNo')}</TableHead>
                      <TableHead>
                        {t('service.inspections.equipment')}
                      </TableHead>
                      <TableHead>{t('service.inspections.customer')}</TableHead>
                      <TableHead>{t('service.inspections.engineer')}</TableHead>
                      <TableHead>{t('service.inspections.planDate')}</TableHead>
                      <TableHead>{t('service.inspections.dueAt')}</TableHead>
                      <TableHead>{t('service.inspections.status')}</TableHead>
                      <TableHead>{t('service.inspections.result')}</TableHead>
                      <TableHead className='text-right'>
                        {t('service.common.actions')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {state.data.rows.map((row) => (
                      <TableRow key={String(row.id)}>
                        <TableCell className='font-mono text-xs'>
                          {row.taskNo}
                        </TableCell>
                        <TableCell>
                          {row.equipment
                            ? `${row.equipment.code ?? ''} ${row.equipment.name ?? ''}`.trim()
                            : '—'}
                        </TableCell>
                        <TableCell>{row.customer?.name ?? '—'}</TableCell>
                        <TableCell>{row.engineer?.name ?? '—'}</TableCell>
                        <TableCell className='text-xs text-muted-foreground'>
                          {formatDateTime(row.planDate)}
                        </TableCell>
                        <TableCell className='text-xs text-muted-foreground'>
                          {formatDateTime(row.dueAt)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={row.status} />
                        </TableCell>
                        <TableCell className='max-w-56 text-sm'>
                          {row.result ?? '—'}
                        </TableCell>
                        <TableCell className='text-right'>
                          <div className='flex justify-end gap-1'>
                            {row.status === 'pending' ||
                            row.status === 'overdue' ? (
                              <Button
                                variant='outline'
                                size='sm'
                                disabled={busy !== null}
                                onClick={() => {
                                  void act('start', () =>
                                    api.post(`/inspections/${row.id}/start`),
                                  );
                                }}
                              >
                                <PlayIcon className='size-3.5' />
                                {t('service.inspections.start')}
                              </Button>
                            ) : null}
                            {row.status === 'in_progress' ? (
                              <Button
                                variant='outline'
                                size='sm'
                                onClick={() => setCompleting(row)}
                              >
                                <CheckCircle2Icon className='size-3.5' />
                                {t('service.inspections.complete')}
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <Pagination
              page={state.data.page}
              pageSize={state.data.pageSize}
              total={state.data.total}
              onPage={setPage}
            />
          </CardContent>
        </Card>
      ) : null}

      <Dialog
        open={completing !== null}
        onOpenChange={() => setCompleting(null)}
      >
        <DialogContent className='sm:max-w-lg'>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const task = completing;
              if (!task) {
                return;
              }
              void act('complete', () =>
                api.post(`/inspections/${task.id}/complete`, {
                  result: formText(data, 'result'),
                }),
              );
              setCompleting(null);
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('service.inspections.complete')}</DialogTitle>
              <DialogDescription>
                {t('service.inspections.completeHint')}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className='py-4'>
              <Field>
                <FieldLabel htmlFor='inspection-result'>
                  {t('service.inspections.result')}
                </FieldLabel>
                <Textarea
                  id='inspection-result'
                  name='result'
                  rows={4}
                  required
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setCompleting(null)}
              >
                {t('service.common.cancel')}
              </Button>
              <Button type='submit'>{t('service.common.confirm')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </ServicePage>
  );
}
