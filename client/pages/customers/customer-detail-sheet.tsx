import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient } from '@nocobase/app-client';
import { MailIcon, PencilIcon, PhoneIcon, PlusIcon } from 'lucide-react';
import { type ReactElement, useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { fetchCustomerDetail } from '../crm/api.js';
import { formatAmount } from '../crm/format.js';
import { STAGE_BADGE } from '../crm/stage.js';
import type { CustomerDetail, Opportunity } from '../crm/types.js';

export interface CustomerDetailSheetProps {
  readonly customerId: number | null;
  /** Bumped by the owner after an edit, to reload the panel. */
  readonly reloadToken: number;
  readonly onOpenChange: (open: boolean) => void;
  readonly onEdit: (detail: CustomerDetail) => void;
  readonly onAddOpportunity: (customerId: number) => void;
  readonly onEditOpportunity: (opportunity: Opportunity) => void;
}

export function CustomerDetailSheet({
  customerId,
  reloadToken,
  onOpenChange,
  onEdit,
  onAddOpportunity,
  onEditOpportunity,
}: CustomerDetailSheetProps): ReactElement {
  return (
    <Sheet open={customerId !== null} onOpenChange={onOpenChange}>
      <SheetContent className='sm:max-w-2xl'>
        {customerId !== null ? (
          // Remounting on the id and reload token gives the panel a fresh
          // starting state, so a reload is a fresh load rather than a
          // contradictory one in the same component.
          <CustomerDetailPanel
            key={`${customerId}:${reloadToken}`}
            customerId={customerId}
            onEdit={onEdit}
            onAddOpportunity={onAddOpportunity}
            onEditOpportunity={onEditOpportunity}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

interface CustomerDetailPanelProps {
  readonly customerId: number;
  readonly onEdit: (detail: CustomerDetail) => void;
  readonly onAddOpportunity: (customerId: number) => void;
  readonly onEditOpportunity: (opportunity: Opportunity) => void;
}

function CustomerDetailPanel({
  customerId,
  onEdit,
  onAddOpportunity,
  onEditOpportunity,
}: CustomerDetailPanelProps): ReactElement {
  const { t, i18n } = useTranslation();
  const api = useApiClient();
  const [detail, setDetail] = useState<CustomerDetail>();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchCustomerDetail(api, customerId, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted) {
          setDetail(result);
          setLoading(false);
        }
      },
      () => {
        if (!controller.signal.aborted) {
          setFailed(true);
          setLoading(false);
        }
      },
    );
    return () => controller.abort();
  }, [api, customerId]);

  const stageLabel = (
    stage: CustomerDetail['opportunities'][number]['stage'],
  ): string => t(`crm.stage.${stage}`, { defaultValue: stage });

  return (
    <>
      {loading ? (
        <div className='flex flex-1 items-center justify-center'>
          <Spinner />
        </div>
      ) : null}
      {failed ? (
        <div className='flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground'>
          {t('crm.errors.loadFailed', { defaultValue: 'Could not load.' })}
        </div>
      ) : null}
      {detail ? (
        <>
          <SheetHeader>
            <div className='flex items-start justify-between gap-3'>
              <div className='min-w-0'>
                <SheetTitle role='heading' aria-level={2}>
                  {detail.name}
                </SheetTitle>
                <SheetDescription>
                  {detail.industry ??
                    t('crm.customers.noIndustry', {
                      defaultValue: 'No industry',
                    })}
                </SheetDescription>
              </div>
              <Button
                variant='outline'
                size='sm'
                onClick={() => onEdit(detail)}
              >
                <PencilIcon data-icon='inline-start' />
                {t('crm.actions.edit', { defaultValue: 'Edit' })}
              </Button>
            </div>
          </SheetHeader>
          <div className='flex flex-1 flex-col gap-6 overflow-y-auto px-4'>
            <Card>
              <CardContent className='py-4'>
                <div className='text-sm text-muted-foreground'>
                  {t('crm.customers.totalAmount', {
                    defaultValue: 'Total opportunity amount',
                  })}
                </div>
                <div className='mt-1 text-2xl font-semibold tabular-nums'>
                  {formatAmount(detail.totalAmount, i18n.language)}
                </div>
              </CardContent>
            </Card>

            <section className='flex flex-col gap-3'>
              <h3 className='text-sm font-medium'>
                {t('crm.customers.contacts', { defaultValue: 'Contacts' })}
              </h3>
              {detail.contacts.length === 0 ? (
                <p className='text-sm text-muted-foreground'>
                  {t('crm.customers.noContacts', {
                    defaultValue: 'No contacts yet.',
                  })}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        {t('crm.fields.name', { defaultValue: 'Name' })}
                      </TableHead>
                      <TableHead>
                        {t('crm.fields.phone', { defaultValue: 'Phone' })}
                      </TableHead>
                      <TableHead>
                        {t('crm.fields.email', { defaultValue: 'Email' })}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.contacts.map((contact) => (
                      <TableRow key={contact.id}>
                        <TableCell className='font-medium'>
                          {contact.name}
                        </TableCell>
                        <TableCell>
                          {contact.phone ? (
                            <span className='inline-flex items-center gap-1.5 text-muted-foreground'>
                              <PhoneIcon className='size-3.5' />
                              {contact.phone}
                            </span>
                          ) : (
                            <span className='text-muted-foreground'>—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {contact.email ? (
                            <span className='inline-flex items-center gap-1.5 text-muted-foreground'>
                              <MailIcon className='size-3.5' />
                              {contact.email}
                            </span>
                          ) : (
                            <span className='text-muted-foreground'>—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>

            <Separator />

            <section className='flex flex-col gap-3 pb-4'>
              <div className='flex items-center justify-between gap-3'>
                <h3 className='text-sm font-medium'>
                  {t('crm.customers.opportunities', {
                    defaultValue: 'Opportunities',
                  })}
                </h3>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => onAddOpportunity(detail.id)}
                >
                  <PlusIcon data-icon='inline-start' />
                  {t('crm.opportunities.create', {
                    defaultValue: 'New opportunity',
                  })}
                </Button>
              </div>
              {detail.opportunities.length === 0 ? (
                <p className='text-sm text-muted-foreground'>
                  {t('crm.customers.noOpportunities', {
                    defaultValue: 'No opportunities yet.',
                  })}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        {t('crm.fields.name', { defaultValue: 'Name' })}
                      </TableHead>
                      <TableHead>
                        {t('crm.fields.stage', { defaultValue: 'Stage' })}
                      </TableHead>
                      <TableHead className='text-right'>
                        {t('crm.fields.amount', { defaultValue: 'Amount' })}
                      </TableHead>
                      <TableHead className='w-10' />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.opportunities.map((opportunity) => (
                      <TableRow key={opportunity.id}>
                        <TableCell className='font-medium'>
                          {opportunity.name}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STAGE_BADGE[opportunity.stage]}>
                            {stageLabel(opportunity.stage)}
                          </Badge>
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {formatAmount(opportunity.amount, i18n.language)}
                        </TableCell>
                        <TableCell className='text-right'>
                          <Button
                            variant='ghost'
                            size='icon-sm'
                            aria-label={t('crm.actions.edit', {
                              defaultValue: 'Edit',
                            })}
                            onClick={() => onEditOpportunity(opportunity)}
                          >
                            <PencilIcon />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>
          </div>
        </>
      ) : null}
    </>
  );
}
