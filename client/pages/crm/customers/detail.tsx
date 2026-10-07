import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { useParams } from 'react-router';

import { BackButton } from '@/components/back-button';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { RouteChildPage } from '@/components/route-child-page';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import {
  deleteContact,
  deleteFollowUp,
  deleteOpportunity,
  fetchCustomerDetail,
  updateFollowUp,
  updateOpportunity,
} from '../api.js';
import { ConfirmDialog } from '../confirm-dialog.js';
import {
  EmptyState,
  FollowUpStatusBadge,
  LevelBadge,
  OverdueBadge,
  RequestError,
} from '../components.js';
import { ContactFormDialog } from '../contact-form.js';
import { CustomerFormDialog } from '../customer-form.js';
import { FollowUpFormDialog } from '../follow-up-form.js';
import { InlineEnumSelect } from '../form-fields.js';
import {
  followUpIsOverdue,
  formatAmount,
  formatDate,
  formatDateTime,
  METHOD_LABEL_KEYS,
  STAGE_LABEL_KEYS,
} from '../format.js';
import { OpportunityFormDialog } from '../opportunity-form.js';
import { useLoad } from '../use-load.js';
import {
  OPPORTUNITY_STAGES,
  type ContactView,
  type FollowUpView,
  type OpportunityView,
} from '../types.js';

export default function CustomerDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const params = useParams<{ customerId: string }>();
  const customerId = Number(params.customerId);
  const canEdit = useCan({
    resource: { type: 'composite', id: 'crm' },
    action: 'edit',
  });
  const canDelete = useCan({
    resource: { type: 'composite', id: 'crm' },
    action: 'delete',
  });

  const { data, error, loading, reload } = useLoad(
    (signal) => fetchCustomerDetail(api, customerId, signal),
    String(customerId),
  );

  const [editCustomer, setEditCustomer] = useState(false);
  const [contactDialog, setContactDialog] = useState<{
    open: boolean;
    contact?: ContactView | null;
  }>({ open: false });
  const [opportunityDialog, setOpportunityDialog] = useState<{
    open: boolean;
    opportunity?: OpportunityView | null;
  }>({ open: false });
  const [followUpDialog, setFollowUpDialog] = useState<{
    open: boolean;
    followUp?: FollowUpView | null;
  }>({ open: false });
  const [deletingContact, setDeletingContact] = useState<ContactView | null>(
    null,
  );
  const [deletingOpportunity, setDeletingOpportunity] =
    useState<OpportunityView | null>(null);
  const [deletingFollowUp, setDeletingFollowUp] = useState<FollowUpView | null>(
    null,
  );

  const customer = data?.customer;

  return (
    <RouteChildPage>
      <PageContainer>
        <BackButton />
        {error ? <RequestError error={error} onRetry={reload} /> : null}
        {loading && !customer ? (
          <p className='text-sm text-muted-foreground'>{t('crm.loading')}</p>
        ) : null}
        {customer ? (
          <>
            <PageHeader
              actions={
                <Button
                  disabled={!canEdit.can}
                  onClick={() => setEditCustomer(true)}
                  variant='outline'
                >
                  {t('actions.edit')}
                </Button>
              }
              description={customer.industry || undefined}
              title={customer.name}
            />

            <Card>
              <CardHeader>
                <CardTitle>{t('crm.customers.detail.info')}</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
                  <DetailItem label={t('crm.customers.field.level')}>
                    <LevelBadge level={customer.level} />
                  </DetailItem>
                  <DetailItem label={t('crm.customers.field.owner')}>
                    {customer.ownerName || customer.ownerId || '—'}
                  </DetailItem>
                  <DetailItem label={t('crm.customers.field.source')}>
                    {customer.source || '—'}
                  </DetailItem>
                  <DetailItem label={t('crm.customers.field.phone')}>
                    {customer.phone || '—'}
                  </DetailItem>
                  <DetailItem label={t('crm.customers.field.email')}>
                    {customer.email || '—'}
                  </DetailItem>
                  <DetailItem label={t('crm.customers.field.website')}>
                    {customer.website || '—'}
                  </DetailItem>
                  <DetailItem label={t('crm.customers.field.address')}>
                    {customer.address || '—'}
                  </DetailItem>
                  <DetailItem label={t('crm.customers.field.notes')}>
                    {customer.notes || '—'}
                  </DetailItem>
                </dl>
              </CardContent>
            </Card>

            {/* Contacts */}
            <Card>
              <CardHeader>
                <CardTitle>{t('crm.contacts.section')}</CardTitle>
                <CardAction>
                  <Button
                    disabled={!canEdit.can}
                    onClick={() =>
                      setContactDialog({ open: true, contact: null })
                    }
                    size='sm'
                    variant='outline'
                  >
                    <PlusIcon data-icon='inline-start' />
                    {t('crm.contacts.create.action')}
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className='px-0'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('crm.contacts.field.name')}</TableHead>
                      <TableHead>{t('crm.contacts.field.position')}</TableHead>
                      <TableHead>{t('crm.contacts.field.phone')}</TableHead>
                      <TableHead>{t('crm.contacts.field.email')}</TableHead>
                      <TableHead>{t('crm.contacts.field.isPrimary')}</TableHead>
                      <TableHead className='text-right'>
                        {t('crm.column.actions')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.contacts.length === 0 ? (
                      <EmptyState colSpan={6}>
                        {t('crm.contacts.empty')}
                      </EmptyState>
                    ) : (
                      data.contacts.map((contact) => (
                        <TableRow key={contact.id}>
                          <TableCell className='font-medium'>
                            {contact.name}
                          </TableCell>
                          <TableCell>{contact.position || '—'}</TableCell>
                          <TableCell>{contact.phone || '—'}</TableCell>
                          <TableCell>{contact.email || '—'}</TableCell>
                          <TableCell>
                            {contact.isPrimary ? t('common.yes') : '—'}
                          </TableCell>
                          <TableCell>
                            <div className='flex justify-end gap-1'>
                              <Button
                                disabled={!canEdit.can}
                                onClick={() =>
                                  setContactDialog({ open: true, contact })
                                }
                                size='sm'
                                variant='ghost'
                              >
                                {t('actions.edit')}
                              </Button>
                              {canDelete.can ? (
                                <Button
                                  onClick={() => setDeletingContact(contact)}
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
              </CardContent>
            </Card>

            {/* Opportunities */}
            <Card>
              <CardHeader>
                <CardTitle>{t('crm.opportunities.section')}</CardTitle>
                <CardAction>
                  <Button
                    disabled={!canEdit.can}
                    onClick={() =>
                      setOpportunityDialog({ open: true, opportunity: null })
                    }
                    size='sm'
                    variant='outline'
                  >
                    <PlusIcon data-icon='inline-start' />
                    {t('crm.opportunities.create.action')}
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className='px-0'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('crm.opportunities.field.name')}</TableHead>
                      <TableHead>
                        {t('crm.opportunities.field.stage')}
                      </TableHead>
                      <TableHead>
                        {t('crm.opportunities.field.amount')}
                      </TableHead>
                      <TableHead>
                        {t('crm.opportunities.field.expectedCloseDate')}
                      </TableHead>
                      <TableHead className='text-right'>
                        {t('crm.column.actions')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.opportunities.length === 0 ? (
                      <EmptyState colSpan={5}>
                        {t('crm.opportunities.empty')}
                      </EmptyState>
                    ) : (
                      data.opportunities.map((opportunity) => (
                        <TableRow key={opportunity.id}>
                          <TableCell className='font-medium'>
                            {opportunity.name}
                          </TableCell>
                          <TableCell>
                            <InlineEnumSelect
                              ariaLabel={t('crm.opportunities.field.stage')}
                              disabled={!canEdit.can}
                              items={OPPORTUNITY_STAGES.map((stage) => ({
                                value: stage,
                                label: t(STAGE_LABEL_KEYS[stage]) ?? stage,
                              }))}
                              onChange={(stage) => {
                                if (!stage) return;
                                void updateOpportunity(api, opportunity.id, {
                                  stage,
                                }).then(reload, () => undefined);
                              }}
                              value={opportunity.stage}
                            />
                          </TableCell>
                          <TableCell>
                            {formatAmount(opportunity.amount)}
                          </TableCell>
                          <TableCell>
                            {formatDate(opportunity.expectedCloseDate)}
                          </TableCell>
                          <TableCell>
                            <div className='flex justify-end gap-1'>
                              <Button
                                disabled={!canEdit.can}
                                onClick={() =>
                                  setOpportunityDialog({
                                    open: true,
                                    opportunity,
                                  })
                                }
                                size='sm'
                                variant='ghost'
                              >
                                {t('actions.edit')}
                              </Button>
                              {canDelete.can ? (
                                <Button
                                  onClick={() =>
                                    setDeletingOpportunity(opportunity)
                                  }
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
              </CardContent>
            </Card>

            {/* Follow-ups */}
            <Card>
              <CardHeader>
                <CardTitle>{t('crm.followUps.section')}</CardTitle>
                <CardAction>
                  <Button
                    disabled={!canEdit.can}
                    onClick={() =>
                      setFollowUpDialog({ open: true, followUp: null })
                    }
                    size='sm'
                    variant='outline'
                  >
                    <PlusIcon data-icon='inline-start' />
                    {t('crm.followUps.create.action')}
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className='px-0'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('crm.followUps.field.dueAt')}</TableHead>
                      <TableHead>{t('crm.followUps.field.method')}</TableHead>
                      <TableHead>{t('crm.followUps.field.content')}</TableHead>
                      <TableHead>{t('crm.followUps.field.status')}</TableHead>
                      <TableHead className='text-right'>
                        {t('crm.column.actions')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.followUps.length === 0 ? (
                      <EmptyState colSpan={5}>
                        {t('crm.followUps.empty')}
                      </EmptyState>
                    ) : (
                      data.followUps.map((followUp) => (
                        <TableRow key={followUp.id}>
                          <TableCell>
                            <div className='flex items-center gap-2'>
                              {formatDateTime(followUp.dueAt)}
                              {followUpIsOverdue(followUp) ? (
                                <OverdueBadge />
                              ) : null}
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
                                onClick={() =>
                                  setFollowUpDialog({ open: true, followUp })
                                }
                                size='sm'
                                variant='ghost'
                              >
                                {t('actions.edit')}
                              </Button>
                              {canDelete.can ? (
                                <Button
                                  onClick={() => setDeletingFollowUp(followUp)}
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
              </CardContent>
            </Card>
          </>
        ) : null}

        {customer && editCustomer ? (
          <CustomerFormDialog
            customer={customer}
            onOpenChange={setEditCustomer}
            onSaved={reload}
            open
          />
        ) : null}

        {contactDialog.open ? (
          <ContactFormDialog
            key={contactDialog.contact?.id ?? 'new'}
            contact={contactDialog.contact}
            customerId={customerId}
            onOpenChange={(open) =>
              setContactDialog((current) => ({ ...current, open }))
            }
            onSaved={reload}
            open
          />
        ) : null}

        {opportunityDialog.open ? (
          <OpportunityFormDialog
            key={opportunityDialog.opportunity?.id ?? 'new'}
            customerId={customerId}
            onOpenChange={(open) =>
              setOpportunityDialog((current) => ({ ...current, open }))
            }
            onSaved={reload}
            open
            opportunity={opportunityDialog.opportunity}
          />
        ) : null}

        {followUpDialog.open ? (
          <FollowUpFormDialog
            key={followUpDialog.followUp?.id ?? 'new'}
            customerId={customerId}
            followUp={followUpDialog.followUp}
            onOpenChange={(open) =>
              setFollowUpDialog((current) => ({ ...current, open }))
            }
            onSaved={reload}
            open
          />
        ) : null}

        {deletingContact ? (
          <ConfirmDialog
            confirmLabel={t('actions.delete')}
            description={deletingContact.name}
            onConfirm={async () => {
              await deleteContact(api, deletingContact.id);
              reload();
            }}
            onOpenChange={(open) => {
              if (!open) setDeletingContact(null);
            }}
            open
            title={t('crm.contacts.delete.title')}
          />
        ) : null}

        {deletingOpportunity ? (
          <ConfirmDialog
            confirmLabel={t('actions.delete')}
            description={deletingOpportunity.name}
            onConfirm={async () => {
              await deleteOpportunity(api, deletingOpportunity.id);
              reload();
            }}
            onOpenChange={(open) => {
              if (!open) setDeletingOpportunity(null);
            }}
            open
            title={t('crm.opportunities.delete.title')}
          />
        ) : null}

        {deletingFollowUp ? (
          <ConfirmDialog
            confirmLabel={t('actions.delete')}
            description={deletingFollowUp.content ?? undefined}
            onConfirm={async () => {
              await deleteFollowUp(api, deletingFollowUp.id);
              reload();
            }}
            onOpenChange={(open) => {
              if (!open) setDeletingFollowUp(null);
            }}
            open
            title={t('crm.followUps.delete.title')}
          />
        ) : null}
      </PageContainer>
    </RouteChildPage>
  );
}

function DetailItem({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className='min-w-0'>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='mt-1 text-sm'>{children}</dd>
    </div>
  );
}
