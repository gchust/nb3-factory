import { useApiClient, useToaster, type ApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { Plus, RefreshCw, RotateCw } from 'lucide-react';
import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { Link, Outlet } from 'react-router';

import { listManuals, reindexManual } from '@/api/service';
import { MANUAL_STATUSES, type DeviceManual } from '@/api/service-types';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { ServiceErrorNotice } from '@/components/service/feedback';
import { FormField, SelectControl } from '@/components/service/form-field';
import { ServiceTable } from '@/components/service/service-table';
import { ManualStatusBadge } from '@/components/service/status-badge';
import { Button } from '@/components/ui/button';
import { useServiceResource } from '@/hooks/use-service-resource';

const REINDEX_LABEL: Readonly<Record<'ready' | 'pending' | 'failed', string>> =
  {
    ready: 'service.manuals.reindexReady',
    pending: 'service.manuals.reindexQueued',
    failed: 'service.manuals.reindexFailed',
  };

/**
 * The device manuals the knowledge base is built from.
 *
 * A manual's status is the indexing result, not the upload result: a new manual
 * is `uploaded` until the indexer has read it, and it becomes `failed` with a
 * reason when the environment cannot index it. The page reports exactly what
 * the server stored, so an unavailable vector database reads as a failure
 * instead of an untruthful success.
 */
export default function ServiceManualsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [status, setStatus] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(
    (client: ApiClient, signal: AbortSignal) =>
      listManuals(client, { status: status || undefined }, signal),
    [status],
  );
  const manuals = useServiceResource(`service-manuals:${status}`, load);
  const canManage = useCan({
    resource: { type: 'composite', id: 'service.manuals' },
    action: 'manage',
  });
  const outletContext = useMemo(
    () => ({ reload: manuals.reload }),
    [manuals.reload],
  );

  async function reindex(manual: DeviceManual): Promise<void> {
    setBusyId(manual.id);
    try {
      const result = await reindexManual(api, manual.id);
      toaster.show({
        type: result.status === 'failed' ? 'warning' : 'success',
        title: t(REINDEX_LABEL[result.status]),
        description: result.detail,
      });
      manuals.reload();
    } catch {
      toaster.show({ type: 'error', title: t('service.errors.title') });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('service.manuals.title')}
        description={t('service.manuals.description')}
        actions={
          <>
            <Button onClick={manuals.reload} size='sm' variant='outline'>
              <RefreshCw aria-hidden='true' />
              {t('service.actions.refresh')}
            </Button>
            {canManage.can ? (
              <Button render={<Link to='new' />} size='sm'>
                <Plus aria-hidden='true' />
                {t('service.manuals.createAction')}
              </Button>
            ) : null}
          </>
        }
      />

      <div className='flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4'>
        <FormField htmlFor='manual-status' label={t('service.manuals.status')}>
          <SelectControl
            id='manual-status'
            onChange={setStatus}
            options={[
              { value: '', label: t('service.manuals.allStatuses') },
              ...MANUAL_STATUSES.map((value) => ({
                value,
                label: t(`service.manualStatus.${value}`),
              })),
            ]}
            value={status}
          />
        </FormField>
      </div>

      {manuals.error ? (
        <ServiceErrorNotice error={manuals.error} onRetry={manuals.reload} />
      ) : null}

      <ServiceTable
        caption={t('service.manuals.title')}
        columns={[
          {
            key: 'title',
            header: t('service.manuals.manualTitle'),
            cell: (row: DeviceManual) => row.title,
          },
          {
            key: 'fileName',
            header: t('service.manuals.fileName'),
            cell: (row) => (
              <span className='font-mono text-xs'>{row.fileName}</span>
            ),
          },
          {
            key: 'status',
            header: t('service.manuals.status'),
            cell: (row) => <ManualStatusBadge status={row.status} />,
          },
          {
            key: 'failureReason',
            header: t('service.manuals.failureReason'),
            cell: (row) => row.failureReason ?? '—',
          },
          {
            key: 'updatedAt',
            header: t('service.manuals.updatedAt'),
            cell: (row) => row.updatedAt,
          },
          ...(canManage.can
            ? [
                {
                  key: 'actions',
                  header: '',
                  align: 'end' as const,
                  cell: (row: DeviceManual) => (
                    <Button
                      disabled={busyId === row.id}
                      onClick={() => {
                        void reindex(row);
                      }}
                      size='xs'
                      variant='ghost'
                    >
                      <RotateCw aria-hidden='true' />
                      {t('service.manuals.reindexAction')}
                    </Button>
                  ),
                },
              ]
            : []),
        ]}
        empty={t('service.manuals.empty')}
        isPending={manuals.isPending}
        rowKey={(row) => String(row.id)}
        rows={manuals.data?.data ?? []}
      />

      <Outlet context={outletContext} />
    </PageContainer>
  );
}
