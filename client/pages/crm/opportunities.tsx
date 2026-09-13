import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { Paperclip, Pencil, Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { AttachmentsPanel } from '@/components/crm/attachments-panel';
import { StageBadge } from '@/components/crm/badges';
import { ConfirmButton } from '@/components/crm/confirm-button';
import {
  CrmEmpty,
  CrmErrorText,
  CrmLoading,
  useCrmError,
} from '@/components/crm/feedback';
import { OpportunityFormDialog } from '@/components/crm/opportunity-form-dialog';
import { SelectField, type SelectOption } from '@/components/crm/fields';
import {
  OPPORTUNITY_STAGES,
  toDate,
  toNumber,
  useCrmApi,
  type Customer,
  type Opportunity,
} from '@/components/crm/api';

export default function CrmOpportunitiesPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const api = useCrmApi();
  const errorFor = useCrmError();
  const [opportunities, setOpportunities] = useState<Opportunity[]>();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stage, setStage] = useState('');
  const [error, setError] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Opportunity>();
  const [attachmentsFor, setAttachmentsFor] = useState<Opportunity>();
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback((): void => {
    setRefreshKey((key) => key + 1);
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([
      api.listOpportunities({ stage: stage || undefined }),
      api.listCustomers(),
    ])
      .then(([rows, customerRows]) => {
        if (!active) return;
        setOpportunities(rows);
        setCustomers(customerRows);
        setError(undefined);
      })
      .catch((cause: unknown) => {
        if (active) setError(errorFor(cause));
      });
    return () => {
      active = false;
    };
  }, [api, stage, refreshKey, errorFor]);

  const customerNames = new Map(customers.map((c) => [c.id, c.name]));
  const stageOptions: SelectOption[] = [
    { value: '', label: t('crm.common.all') },
    ...OPPORTUNITY_STAGES.map((value) => ({
      value,
      label: t(`crm.stage.${value}`),
    })),
  ];

  return (
    <section className='space-y-6 p-6'>
      <header className='flex flex-wrap items-end justify-between gap-3'>
        <div>
          <h1 className='font-heading text-2xl font-semibold tracking-tight'>
            {t('crm.opportunities.title')}
          </h1>
          <p className='text-sm text-muted-foreground'>
            {t('crm.opportunities.subtitle')}
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className='size-4' />
          {t('crm.opportunities.new')}
        </Button>
      </header>

      <div className='max-w-xs'>
        <SelectField
          id='opportunity-stage-filter'
          label={t('crm.opportunities.filterStage')}
          value={stage}
          onChange={setStage}
          options={stageOptions}
        />
      </div>

      <CrmErrorText message={error} />

      {opportunities === undefined ? (
        <CrmLoading label={t('crm.common.loading')} />
      ) : opportunities.length === 0 ? (
        <CrmEmpty>{t('crm.opportunities.empty')}</CrmEmpty>
      ) : (
        <div className='rounded-xl border border-border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('crm.opportunities.name')}</TableHead>
                <TableHead>{t('crm.opportunities.customer')}</TableHead>
                <TableHead>{t('crm.opportunities.stage')}</TableHead>
                <TableHead>{t('crm.opportunities.amount')}</TableHead>
                <TableHead>
                  {t('crm.opportunities.expectedCloseDate')}
                </TableHead>
                <TableHead>{t('crm.common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {opportunities.map((opportunity) => (
                <TableRow key={opportunity.id}>
                  <TableCell className='font-medium'>
                    {opportunity.name}
                  </TableCell>
                  <TableCell>
                    <Link
                      className='text-primary hover:underline'
                      to={`/crm/customers/${opportunity.customerId}`}
                    >
                      {customerNames.get(opportunity.customerId) ??
                        `#${opportunity.customerId}`}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StageBadge stage={opportunity.stage} />
                  </TableCell>
                  <TableCell className='text-muted-foreground'>
                    {toNumber(opportunity.amount) ?? t('crm.common.none')}
                  </TableCell>
                  <TableCell className='text-muted-foreground'>
                    {toDate(opportunity.expectedCloseDate)?.toLocaleDateString(
                      i18n.language,
                    ) ?? t('crm.common.none')}
                  </TableCell>
                  <TableCell>
                    <div className='flex items-center gap-1'>
                      <Button
                        aria-label={t('crm.attachments.title')}
                        size='icon-sm'
                        variant='ghost'
                        onClick={() => setAttachmentsFor(opportunity)}
                      >
                        <Paperclip className='size-4' />
                      </Button>
                      <Button
                        size='icon-sm'
                        variant='ghost'
                        onClick={() => setEditing(opportunity)}
                      >
                        <Pencil className='size-4' />
                      </Button>
                      <ConfirmButton
                        title={t('crm.opportunities.deleteConfirm')}
                        onConfirm={async () => {
                          await api.deleteOpportunity(opportunity.id);
                          refresh();
                        }}
                      >
                        <Trash2 className='size-4' />
                      </ConfirmButton>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <OpportunityFormDialog
        key={editing ? `edit-${editing.id}` : creating ? 'new' : 'closed'}
        customers={customers}
        open={creating || editing !== undefined}
        opportunity={editing}
        onOpenChange={(open) => {
          setCreating(open);
          if (!open) setEditing(undefined);
        }}
        onSaved={refresh}
      />

      <Dialog
        open={attachmentsFor !== undefined}
        onOpenChange={(open) => {
          if (!open) setAttachmentsFor(undefined);
        }}
      >
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>
              {t('crm.attachments.title')}
              {attachmentsFor ? ` · ${attachmentsFor.name}` : ''}
            </DialogTitle>
          </DialogHeader>
          {attachmentsFor ? (
            <AttachmentsPanel
              targetType='opportunity'
              targetId={attachmentsFor.id}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
