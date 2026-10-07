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

import {
  deleteOpportunity,
  fetchOpportunities,
  updateOpportunity,
} from '../api.js';
import { ConfirmDialog } from '../confirm-dialog.js';
import { EmptyState, RequestError } from '../components.js';
import { InlineEnumSelect } from '../form-fields.js';
import { formatAmount, formatDate, STAGE_LABEL_KEYS } from '../format.js';
import { OpportunityFormDialog } from '../opportunity-form.js';
import { useLoad } from '../use-load.js';
import { OPPORTUNITY_STAGES, type OpportunityView } from '../types.js';

const PAGE_SIZE = 20;

export default function OpportunitiesPage(): ReactElement {
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

  const [stage, setStage] = useState('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<{
    open: boolean;
    opportunity?: OpportunityView | null;
  }>({ open: false });
  const [deleting, setDeleting] = useState<OpportunityView | null>(null);

  const { data, error, loading, reload } = useLoad(
    (signal) =>
      fetchOpportunities(
        api,
        {
          stage: stage || undefined,
          page,
          pageSize: PAGE_SIZE,
          sort: 'newest',
        },
        signal,
      ),
    `${stage}|${page}`,
  );

  const rows = data?.data ?? [];
  const meta = data?.meta;

  return (
    <PageContainer>
      <PageHeader
        actions={
          <Button
            disabled={!canEdit.can}
            onClick={() => setDialog({ open: true, opportunity: null })}
          >
            <PlusIcon data-icon='inline-start' />
            {t('crm.opportunities.create.action')}
          </Button>
        }
        description={t('crm.opportunities.description')}
        title={t('crm.opportunities.title')}
      />

      <div className='flex flex-wrap gap-1'>
        <Button
          onClick={() => {
            setStage('');
            setPage(1);
          }}
          size='sm'
          variant={stage === '' ? 'secondary' : 'ghost'}
        >
          {t('crm.opportunities.stageAll')}
        </Button>
        {OPPORTUNITY_STAGES.map((value) => (
          <Button
            key={value}
            onClick={() => {
              setStage(value);
              setPage(1);
            }}
            size='sm'
            variant={stage === value ? 'secondary' : 'ghost'}
          >
            {t(STAGE_LABEL_KEYS[value])}
          </Button>
        ))}
      </div>

      {error ? <RequestError error={error} onRetry={reload} /> : null}

      <div className='rounded-xl border border-border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('crm.opportunities.field.name')}</TableHead>
              <TableHead>{t('crm.opportunities.field.customer')}</TableHead>
              <TableHead>{t('crm.opportunities.field.stage')}</TableHead>
              <TableHead>{t('crm.opportunities.field.amount')}</TableHead>
              <TableHead>
                {t('crm.opportunities.field.expectedCloseDate')}
              </TableHead>
              <TableHead>{t('crm.customers.column.owner')}</TableHead>
              <TableHead className='text-right'>
                {t('crm.column.actions')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <EmptyState colSpan={7}>
                {loading ? t('crm.loading') : t('crm.opportunities.empty')}
              </EmptyState>
            ) : (
              rows.map((opportunity) => (
                <TableRow key={opportunity.id}>
                  <TableCell className='font-medium'>
                    {opportunity.name}
                  </TableCell>
                  <TableCell>
                    {opportunity.customerId ? (
                      <Link
                        className='underline-offset-4 hover:underline'
                        to={{
                          pathname: `/crm/customers/${opportunity.customerId}`,
                          search: location.search,
                        }}
                      >
                        {opportunity.customerName ?? opportunity.customerId}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    <InlineEnumSelect
                      ariaLabel={t('crm.opportunities.field.stage')}
                      disabled={!canEdit.can}
                      items={OPPORTUNITY_STAGES.map((value) => ({
                        value,
                        label: t(STAGE_LABEL_KEYS[value]) ?? value,
                      }))}
                      onChange={(next) => {
                        if (!next) return;
                        void updateOpportunity(api, opportunity.id, {
                          stage: next,
                        }).then(reload, () => undefined);
                      }}
                      value={opportunity.stage}
                    />
                  </TableCell>
                  <TableCell>{formatAmount(opportunity.amount)}</TableCell>
                  <TableCell>
                    {formatDate(opportunity.expectedCloseDate)}
                  </TableCell>
                  <TableCell>
                    {opportunity.ownerName || opportunity.ownerId || '—'}
                  </TableCell>
                  <TableCell>
                    <div className='flex justify-end gap-1'>
                      <Button
                        disabled={!canEdit.can}
                        onClick={() => setDialog({ open: true, opportunity })}
                        size='sm'
                        variant='ghost'
                      >
                        {t('actions.edit')}
                      </Button>
                      {canDelete.can ? (
                        <Button
                          onClick={() => setDeleting(opportunity)}
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
        <OpportunityFormDialog
          key={dialog.opportunity?.id ?? 'new'}
          onOpenChange={(open) =>
            setDialog((current) => ({ ...current, open }))
          }
          onSaved={reload}
          open
          opportunity={dialog.opportunity}
        />
      ) : null}

      {deleting ? (
        <ConfirmDialog
          confirmLabel={t('actions.delete')}
          description={deleting.name}
          onConfirm={async () => {
            await deleteOpportunity(api, deleting.id);
            reload();
          }}
          onOpenChange={(open) => {
            if (!open) setDeleting(null);
          }}
          open
          title={t('crm.opportunities.delete.title')}
        />
      ) : null}
    </PageContainer>
  );
}
