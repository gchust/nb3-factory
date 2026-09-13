import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { ConfirmButton } from '@/components/crm/confirm-button';
import {
  CrmEmpty,
  CrmErrorText,
  CrmLoading,
  useCrmError,
} from '@/components/crm/feedback';
import { FollowUpFormDialog } from '@/components/crm/follow-up-form-dialog';
import { SelectField, type SelectOption } from '@/components/crm/fields';
import {
  toDate,
  useCrmApi,
  type Customer,
  type FollowUp,
  type Opportunity,
} from '@/components/crm/api';

export default function CrmFollowUpsPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const api = useCrmApi();
  const errorFor = useCrmError();
  const [followUps, setFollowUps] = useState<FollowUp[]>();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [error, setError] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback((): void => {
    setRefreshKey((key) => key + 1);
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([
      api.listFollowUps({
        customerId: customerId ? Number(customerId) : undefined,
      }),
      api.listCustomers(),
      api.listOpportunities(),
    ])
      .then(([rows, customerRows, opportunityRows]) => {
        if (!active) return;
        setFollowUps(rows);
        setCustomers(customerRows);
        setOpportunities(opportunityRows);
        setError(undefined);
      })
      .catch((cause: unknown) => {
        if (active) setError(errorFor(cause));
      });
    return () => {
      active = false;
    };
  }, [api, customerId, refreshKey, errorFor]);

  const customerNames = new Map(customers.map((c) => [c.id, c.name]));
  const opportunityNames = new Map(opportunities.map((o) => [o.id, o.name]));
  const customerOptions: SelectOption[] = [
    { value: '', label: t('crm.followUps.allCustomers') },
    ...customers.map((customer) => ({
      value: String(customer.id),
      label: customer.name,
    })),
  ];

  return (
    <section className='space-y-6 p-6'>
      <header className='flex flex-wrap items-end justify-between gap-3'>
        <div>
          <h1 className='font-heading text-2xl font-semibold tracking-tight'>
            {t('crm.followUps.title')}
          </h1>
          <p className='text-sm text-muted-foreground'>
            {t('crm.followUps.subtitle')}
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className='size-4' />
          {t('crm.followUps.new')}
        </Button>
      </header>

      <div className='max-w-xs'>
        <SelectField
          id='follow-up-customer-filter'
          label={t('crm.followUps.customer')}
          value={customerId}
          onChange={setCustomerId}
          options={customerOptions}
        />
      </div>

      <CrmErrorText message={error} />

      {followUps === undefined ? (
        <CrmLoading label={t('crm.common.loading')} />
      ) : followUps.length === 0 ? (
        <CrmEmpty>{t('crm.followUps.empty')}</CrmEmpty>
      ) : (
        <div className='rounded-xl border border-border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('crm.followUps.followedAt')}</TableHead>
                <TableHead>{t('crm.followUps.method')}</TableHead>
                <TableHead>{t('crm.followUps.summary')}</TableHead>
                <TableHead>{t('crm.followUps.target')}</TableHead>
                <TableHead>{t('crm.common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {followUps.map((followUp) => (
                <TableRow key={followUp.id}>
                  <TableCell className='whitespace-nowrap text-muted-foreground'>
                    {toDate(followUp.followedAt)?.toLocaleString(
                      i18n.language,
                    ) ?? ''}
                  </TableCell>
                  <TableCell>
                    <Badge variant='outline'>
                      {t(`crm.method.${followUp.method}`, {
                        defaultValue: followUp.method,
                      })}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <p className='font-medium'>{followUp.summary}</p>
                    {followUp.nextStep ? (
                      <p className='text-sm text-muted-foreground'>
                        {t('crm.followUps.nextStep')}: {followUp.nextStep}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {followUp.customerId !== null ? (
                      <Link
                        className='text-primary hover:underline'
                        to={`/crm/customers/${followUp.customerId}`}
                      >
                        {customerNames.get(followUp.customerId) ??
                          `#${followUp.customerId}`}
                      </Link>
                    ) : followUp.opportunityId !== null ? (
                      <span className='text-muted-foreground'>
                        {opportunityNames.get(followUp.opportunityId) ??
                          `#${followUp.opportunityId}`}
                      </span>
                    ) : (
                      t('crm.common.none')
                    )}
                  </TableCell>
                  <TableCell>
                    <ConfirmButton
                      title={t('crm.followUps.deleteConfirm')}
                      onConfirm={async () => {
                        await api.deleteFollowUp(followUp.id);
                        refresh();
                      }}
                    >
                      <Trash2 className='size-4' />
                    </ConfirmButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <FollowUpFormDialog
        key={creating ? 'open' : 'closed'}
        customers={customers}
        opportunities={opportunities}
        open={creating}
        onOpenChange={setCreating}
        onSaved={refresh}
      />
    </section>
  );
}
