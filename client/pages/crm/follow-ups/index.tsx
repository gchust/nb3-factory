import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { Link, useLocation } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { deleteFollowUp, fetchFollowUps, updateFollowUp } from '../api.js';
import { ConfirmDialog } from '../confirm-dialog.js';
import {
  EmptyState,
  FollowUpStatusBadge,
  OverdueBadge,
  RequestError,
} from '../components.js';
import { FollowUpFormDialog } from '../follow-up-form.js';
import {
  FOLLOW_UP_STATUS_LABEL_KEYS,
  followUpIsOverdue,
  formatDateTime,
  METHOD_LABEL_KEYS,
} from '../format.js';
import { useLoad } from '../use-load.js';
import { FOLLOW_UP_STATUSES, type FollowUpView } from '../types.js';

const PAGE_SIZE = 20;

export default function FollowUpsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const location = useLocation();
  const canEdit = useCan({
    resource: { type: 'composite', id: 'crm' },
    action: 'edit',
  });
  const canDelete = useCan({
    resource: { type: 'composite', id: 'crm' },
    action: 'delete',
  });

  const [status, setStatus] = useState('pending');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<{
    open: boolean;
    followUp?: FollowUpView | null;
  }>({ open: false });
  const [deleting, setDeleting] = useState<FollowUpView | null>(null);

  const { data, error, loading, reload } = useLoad(
    (signal) =>
      fetchFollowUps(
        api,
        {
          status: status || undefined,
          overdueOnly: overdueOnly ? true : undefined,
          page,
          pageSize: PAGE_SIZE,
          sort: 'dueAt',
        },
        signal,
      ),
    `${status}|${String(overdueOnly)}|${page}`,
  );

  const rows = data?.data ?? [];
  const meta = data?.meta;

  return (
    <PageContainer>
      <PageHeader
        actions={
          <Button
            disabled={!canEdit.can}
            onClick={() => setDialog({ open: true, followUp: null })}
          >
            <PlusIcon data-icon='inline-start' />
            {t('crm.followUps.create.action')}
          </Button>
        }
        description={t('crm.followUps.description')}
        title={t('crm.followUps.title')}
      />

      <div className='flex flex-wrap gap-1'>
        <Button
          onClick={() => {
            setStatus('');
            setPage(1);
          }}
          size='sm'
          variant={status === '' ? 'secondary' : 'ghost'}
        >
          {t('crm.followUps.statusAll')}
        </Button>
        {FOLLOW_UP_STATUSES.map((value) => (
          <Button
            key={value}
            onClick={() => {
              setStatus(value);
              setPage(1);
            }}
            size='sm'
            variant={status === value ? 'secondary' : 'ghost'}
          >
            {t(FOLLOW_UP_STATUS_LABEL_KEYS[value])}
          </Button>
        ))}
        <Button
          onClick={() => {
            setOverdueOnly((current) => !current);
            setPage(1);
          }}
          size='sm'
          variant={overdueOnly ? 'secondary' : 'ghost'}
        >
          {t('crm.followUps.overdueOnly')}
        </Button>
      </div>

      {error ? <RequestError error={error} onRetry={reload} /> : null}

      <div className='rounded-xl border border-border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('crm.followUps.field.customer')}</TableHead>
              <TableHead>{t('crm.followUps.field.dueAt')}</TableHead>
              <TableHead>{t('crm.followUps.field.method')}</TableHead>
              <TableHead>{t('crm.followUps.field.content')}</TableHead>
              <TableHead>{t('crm.followUps.field.status')}</TableHead>
              <TableHead>{t('crm.customers.column.owner')}</TableHead>
              <TableHead className='text-right'>
                {t('crm.column.actions')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <EmptyState colSpan={7}>
                {loading ? t('crm.loading') : t('crm.followUps.empty')}
              </EmptyState>
            ) : (
              rows.map((followUp) => (
                <TableRow key={followUp.id}>
                  <TableCell className='font-medium'>
                    {followUp.customerId ? (
                      <Link
                        className='underline-offset-4 hover:underline'
                        to={{
                          pathname: `/crm/customers/${followUp.customerId}`,
                          search: location.search,
                        }}
                      >
                        {followUp.customerName ?? followUp.customerId}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    <div className='flex items-center gap-2'>
                      {formatDateTime(followUp.dueAt)}
                      {followUpIsOverdue(followUp) ? <OverdueBadge /> : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    {METHOD_LABEL_KEYS[followUp.method]
                      ? t(METHOD_LABEL_KEYS[followUp.method])
                      : followUp.method}
                  </TableCell>
                  <TableCell>{followUp.content || '—'}</TableCell>
                  <TableCell>
                    <FollowUpStatusBadge status={followUp.status} />
                  </TableCell>
                  <TableCell>
                    {followUp.ownerName || followUp.ownerId || '—'}
                  </TableCell>
                  <TableCell>
                    <div className='flex justify-end gap-1'>
                      {followUp.status === 'pending' ? (
                        <Button
                          disabled={!canEdit.can}
                          onClick={() => {
                            void updateFollowUp(api, followUp.id, {
                              status: 'done',
                            }).then(reload, () => undefined);
                          }}
                          size='sm'
                          variant='ghost'
                        >
                          {t('crm.followUps.markDone')}
                        </Button>
                      ) : null}
                      <Button
                        disabled={!canEdit.can}
                        onClick={() => setDialog({ open: true, followUp })}
                        size='sm'
                        variant='ghost'
                      >
                        {t('actions.edit')}
                      </Button>
                      {canDelete.can ? (
                        <Button
                          onClick={() => setDeleting(followUp)}
                          size='sm'
                          variant='ghost'
                        >
                          {t('actions.delete')}
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {meta ? (
        <div className='flex items-center justify-between text-sm text-muted-foreground'>
          <span>{t('crm.pagination.total', { total: meta.total })}</span>
          <div className='flex items-center gap-2'>
            <Button
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              size='sm'
              variant='outline'
            >
              {t('crm.pagination.previous')}
            </Button>
            <span>
              {t('crm.pagination.page', {
                page: meta.page,
                pageCount: Math.max(1, Math.ceil(meta.total / meta.pageSize)),
              })}
            </span>
            <Button
              disabled={page * PAGE_SIZE >= meta.total}
              onClick={() => setPage((current) => current + 1)}
              size='sm'
              variant='outline'
            >
              {t('crm.pagination.next')}
            </Button>
          </div>
        </div>
      ) : null}

      {dialog.open ? (
        <FollowUpFormDialog
          key={dialog.followUp?.id ?? 'new'}
          followUp={dialog.followUp}
          onOpenChange={(open) =>
            setDialog((current) => ({ ...current, open }))
          }
          onSaved={reload}
          open
        />
      ) : null}

      {deleting ? (
        <ConfirmDialog
          confirmLabel={t('actions.delete')}
          description={deleting.content ?? undefined}
          onConfirm={async () => {
            await deleteFollowUp(api, deleting.id);
            reload();
          }}
          onOpenChange={(open) => {
            if (!open) setDeleting(null);
          }}
          open
          title={t('crm.followUps.delete.title')}
        />
      ) : null}
    </PageContainer>
  );
}
