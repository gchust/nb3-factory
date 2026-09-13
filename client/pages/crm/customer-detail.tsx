import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeft, Pencil, Plus, Trash2, UserCog } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';

import { Badge } from '@/components/ui/badge';
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

import { StageBadge, StatusBadge } from '@/components/crm/badges';
import { AttachmentsPanel } from '@/components/crm/attachments-panel';
import { ConfirmButton } from '@/components/crm/confirm-button';
import { ContactFormDialog } from '@/components/crm/contact-form-dialog';
import { CustomerFormDialog } from '@/components/crm/customer-form-dialog';
import {
  CrmEmpty,
  CrmErrorText,
  CrmLoading,
  useCrmError,
} from '@/components/crm/feedback';
import { FollowUpFormDialog } from '@/components/crm/follow-up-form-dialog';
import { OpportunityFormDialog } from '@/components/crm/opportunity-form-dialog';
import { ReassignDialog } from '@/components/crm/reassign-dialog';
import { useCrmSession } from '@/components/crm/session';
import {
  toDate,
  toNumber,
  useCrmApi,
  type Contact,
  type Customer,
  type FollowUp,
  type Opportunity,
} from '@/components/crm/api';

export default function CrmCustomerDetailPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const api = useCrmApi();
  const errorFor = useCrmError();
  const { canManage } = useCrmSession();
  const { customerId } = useParams();
  const navigate = useNavigate();
  const id = Number(customerId);

  const [customer, setCustomer] = useState<Customer>();
  const [contacts, setContacts] = useState<Contact[]>();
  const [opportunities, setOpportunities] = useState<Opportunity[]>();
  const [followUps, setFollowUps] = useState<FollowUp[]>();
  const [error, setError] = useState<string>();
  const [refreshKey, setRefreshKey] = useState(0);

  const [editing, setEditing] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const [contactDialog, setContactDialog] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact>();
  const [opportunityDialog, setOpportunityDialog] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState<Opportunity>();
  const [followUpDialog, setFollowUpDialog] = useState(false);

  const refresh = useCallback((): void => {
    setRefreshKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (!Number.isInteger(id)) return;
    let active = true;
    Promise.all([
      api.getCustomer(id),
      api.listContacts(id),
      api.listOpportunities({ customerId: id }),
      api.listFollowUps({ customerId: id }),
    ])
      .then(([c, ct, op, fu]) => {
        if (!active) return;
        setCustomer(c);
        setContacts(ct);
        setOpportunities(op);
        setFollowUps(fu);
        setError(undefined);
      })
      .catch((cause: unknown) => {
        if (active) setError(errorFor(cause));
      });
    return () => {
      active = false;
    };
  }, [api, id, refreshKey, errorFor]);

  if (!Number.isInteger(id)) {
    return (
      <section className='p-6'>
        <CrmErrorText message={t('crm.errors.INVALID_ID')} />
      </section>
    );
  }

  return (
    <section className='space-y-6 p-6'>
      <div className='flex items-center gap-3'>
        <Button size='sm' variant='ghost' render={<Link to='/crm/customers' />}>
          <ArrowLeft className='size-4' />
          {t('crm.common.back')}
        </Button>
      </div>

      {error ? <CrmErrorText message={error} /> : null}

      {customer === undefined ? (
        <CrmLoading label={t('crm.common.loading')} />
      ) : (
        <Card>
          <CardHeader className='flex-row items-start justify-between gap-3'>
            <div>
              <CardTitle className='text-xl'>{customer.name}</CardTitle>
              <div className='mt-1 flex items-center gap-2'>
                <StatusBadge status={customer.status} />
                <span className='text-sm text-muted-foreground'>
                  {customer.industry || t('crm.common.none')}
                  {customer.companySize
                    ? ` · ${t(`crm.companySize.${customer.companySize}`)}`
                    : ''}
                </span>
              </div>
            </div>
            <div className='flex shrink-0 items-center gap-2'>
              {canManage ? (
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => setReassigning(true)}
                >
                  <UserCog className='size-4' />
                  {t('crm.customers.reassign')}
                </Button>
              ) : null}
              <Button
                size='sm'
                variant='outline'
                onClick={() => setEditing(true)}
              >
                <Pencil className='size-4' />
                {t('crm.common.edit')}
              </Button>
              <ConfirmButton
                description={t('crm.customers.deleteConfirm')}
                title={t('crm.common.delete')}
                variant='destructive'
                size='sm'
                onConfirm={async () => {
                  await api.deleteCustomer(id);
                  void navigate('/crm/customers');
                }}
              >
                <Trash2 className='size-4' />
              </ConfirmButton>
            </div>
          </CardHeader>
          <CardContent className='space-y-2 text-sm'>
            <p>
              <span className='text-muted-foreground'>
                {t('crm.customers.source')}:{' '}
              </span>
              {customer.source
                ? t(`crm.source.${customer.source}`)
                : t('crm.common.none')}
            </p>
            {customer.notes ? (
              <p className='whitespace-pre-wrap'>{customer.notes}</p>
            ) : null}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className='flex-row items-center justify-between'>
          <CardTitle>{t('crm.customers.contacts')}</CardTitle>
          <Button size='sm' onClick={() => setContactDialog(true)}>
            <Plus className='size-4' />
            {t('crm.contacts.add')}
          </Button>
        </CardHeader>
        <CardContent>
          {contacts === undefined ? (
            <CrmLoading label={t('crm.common.loading')} />
          ) : contacts.length === 0 ? (
            <CrmEmpty>{t('crm.contacts.empty')}</CrmEmpty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('crm.contacts.name')}</TableHead>
                  <TableHead>{t('crm.contacts.title')}</TableHead>
                  <TableHead>{t('crm.contacts.phone')}</TableHead>
                  <TableHead>{t('crm.contacts.email')}</TableHead>
                  <TableHead>{t('crm.common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell className='font-medium'>
                      <span className='inline-flex items-center gap-2'>
                        {contact.name}
                        {contact.isPrimary ? (
                          <Badge variant='secondary'>
                            {t('crm.contacts.primary')}
                          </Badge>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className='text-muted-foreground'>
                      {contact.title || t('crm.common.none')}
                    </TableCell>
                    <TableCell className='text-muted-foreground'>
                      {contact.phone || t('crm.common.none')}
                    </TableCell>
                    <TableCell className='text-muted-foreground'>
                      {contact.email || t('crm.common.none')}
                    </TableCell>
                    <TableCell>
                      <div className='flex items-center gap-1'>
                        <Button
                          size='icon-sm'
                          variant='ghost'
                          onClick={() => setEditingContact(contact)}
                        >
                          <Pencil className='size-4' />
                        </Button>
                        <ConfirmButton
                          title={t('crm.contacts.deleteConfirm')}
                          onConfirm={async () => {
                            await api.deleteContact(contact.id);
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
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className='flex-row items-center justify-between'>
          <CardTitle>{t('crm.customers.opportunities')}</CardTitle>
          <Button size='sm' onClick={() => setOpportunityDialog(true)}>
            <Plus className='size-4' />
            {t('crm.opportunities.new')}
          </Button>
        </CardHeader>
        <CardContent>
          {opportunities === undefined ? (
            <CrmLoading label={t('crm.common.loading')} />
          ) : opportunities.length === 0 ? (
            <CrmEmpty>{t('crm.opportunities.empty')}</CrmEmpty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('crm.opportunities.name')}</TableHead>
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
                      <StageBadge stage={opportunity.stage} />
                    </TableCell>
                    <TableCell className='text-muted-foreground'>
                      {toNumber(opportunity.amount) ?? t('crm.common.none')}
                    </TableCell>
                    <TableCell className='text-muted-foreground'>
                      {toDate(
                        opportunity.expectedCloseDate,
                      )?.toLocaleDateString(i18n.language) ??
                        t('crm.common.none')}
                    </TableCell>
                    <TableCell>
                      <div className='flex items-center gap-1'>
                        <Button
                          size='icon-sm'
                          variant='ghost'
                          onClick={() => setEditingOpportunity(opportunity)}
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
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className='flex-row items-center justify-between'>
          <CardTitle>{t('crm.customers.followUps')}</CardTitle>
          <Button size='sm' onClick={() => setFollowUpDialog(true)}>
            <Plus className='size-4' />
            {t('crm.followUps.new')}
          </Button>
        </CardHeader>
        <CardContent>
          <FollowUpList
            followUps={followUps}
            onDelete={async (followUpId) => {
              await api.deleteFollowUp(followUpId);
              refresh();
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('crm.attachments.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <AttachmentsPanel targetId={id} targetType='customer' />
        </CardContent>
      </Card>

      {customer ? (
        <>
          <CustomerFormDialog
            key={editing ? `edit-${customer.id}` : 'closed'}
            customer={customer}
            open={editing}
            onOpenChange={setEditing}
            onSaved={refresh}
          />
          <ReassignDialog
            key={reassigning ? `assign-${customer.id}` : 'closed'}
            customer={customer}
            open={reassigning}
            onOpenChange={setReassigning}
            onSaved={refresh}
          />
        </>
      ) : null}

      <ContactFormDialog
        key={
          editingContact
            ? `edit-${editingContact.id}`
            : contactDialog
              ? 'new'
              : 'closed'
        }
        contact={editingContact}
        customerId={id}
        open={contactDialog || editingContact !== undefined}
        onOpenChange={(open) => {
          setContactDialog(open);
          if (!open) setEditingContact(undefined);
        }}
        onSaved={refresh}
      />

      <OpportunityFormDialog
        key={
          editingOpportunity
            ? `edit-${editingOpportunity.id}`
            : opportunityDialog
              ? 'new'
              : 'closed'
        }
        customerId={id}
        open={opportunityDialog || editingOpportunity !== undefined}
        opportunity={editingOpportunity}
        onOpenChange={(open) => {
          setOpportunityDialog(open);
          if (!open) setEditingOpportunity(undefined);
        }}
        onSaved={refresh}
      />

      <FollowUpFormDialog
        key={followUpDialog ? 'open' : 'closed'}
        customerId={id}
        open={followUpDialog}
        onOpenChange={setFollowUpDialog}
        onSaved={refresh}
      />
    </section>
  );
}

function FollowUpList({
  followUps,
  onDelete,
}: {
  followUps: FollowUp[] | undefined;
  onDelete: (id: number) => Promise<void>;
}): ReactElement {
  const { t, i18n } = useTranslation();
  if (followUps === undefined) {
    return <CrmLoading label={t('crm.common.loading')} />;
  }
  if (followUps.length === 0) {
    return <CrmEmpty>{t('crm.followUps.empty')}</CrmEmpty>;
  }
  return (
    <ul className='space-y-3'>
      {followUps.map((followUp) => (
        <li
          key={followUp.id}
          className='flex items-start justify-between gap-3 rounded-lg border border-border p-3'
        >
          <div className='space-y-1'>
            <div className='flex items-center gap-2'>
              <Badge variant='outline'>
                {t(`crm.method.${followUp.method}`, {
                  defaultValue: followUp.method,
                })}
              </Badge>
              <span className='text-xs text-muted-foreground'>
                {toDate(followUp.followedAt)?.toLocaleString(i18n.language) ??
                  ''}
              </span>
            </div>
            <p className='text-sm'>{followUp.summary}</p>
            {followUp.nextStep ? (
              <p className='text-sm text-muted-foreground'>
                {t('crm.followUps.nextStep')}: {followUp.nextStep}
              </p>
            ) : null}
          </div>
          <ConfirmButton
            title={t('crm.followUps.deleteConfirm')}
            onConfirm={() => onDelete(followUp.id)}
          >
            <Trash2 className='size-4' />
          </ConfirmButton>
        </li>
      ))}
    </ul>
  );
}
