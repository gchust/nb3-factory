import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient } from '@nocobase/app-client';
import { Plus, RefreshCw } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  formatAmount,
  listOpportunities,
  OPPORTUNITY_STAGES,
  type OpportunityRecord,
  type OpportunityStage,
} from '../api.js';
import { DataTable, StageBadge, StatePanel, TableCell } from '../components.js';
import {
  describeRequestError,
  useCrmData,
  useRequestErrorMessages,
} from '../hooks.js';

type StageFilter = OpportunityStage | 'all';

export default function OpportunitiesPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const navigate = useNavigate();
  const location = useLocation();
  const errorMessages = useRequestErrorMessages();
  const [stage, setStage] = useState<StageFilter>('all');
  const { data, error, loading, reload } = useCrmData<OpportunityRecord[]>(
    `opportunities:${stage}:${location.key}`,
    (signal) =>
      listOpportunities(api, stage === 'all' ? undefined : stage, { signal }),
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('crm.opportunities.title')}
        description={t('crm.opportunities.description')}
        actions={
          <>
            <Select
              value={stage}
              onValueChange={(value) => setStage(value as StageFilter)}
            >
              <SelectTrigger
                size='sm'
                aria-label={t('crm.opportunities.filterStage')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>
                  {t('crm.opportunities.allStages')}
                </SelectItem>
                {OPPORTUNITY_STAGES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`crm.stage.${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant='outline'
              size='sm'
              onClick={reload}
              disabled={loading}
            >
              <RefreshCw />
              {t('crm.common.refresh')}
            </Button>
            <Button size='sm' onClick={() => void navigate('new')}>
              <Plus />
              {t('crm.opportunities.add')}
            </Button>
          </>
        }
      />

      {loading && !data ? (
        <StatePanel>{t('crm.common.loading')}</StatePanel>
      ) : null}
      {error ? (
        <StatePanel>{describeRequestError(error, errorMessages)}</StatePanel>
      ) : null}
      {data && data.length === 0 && !error ? (
        <StatePanel>{t('crm.opportunities.empty')}</StatePanel>
      ) : null}

      {data && data.length > 0 && !error ? (
        <DataTable
          headers={[
            t('crm.opportunities.name'),
            t('crm.opportunities.customer'),
            t('crm.opportunities.amount'),
            t('crm.opportunities.stage'),
            t('crm.common.actions'),
          ]}
        >
          {data.map((opportunity) => (
            <tr key={opportunity.id}>
              <TableCell className='font-medium'>{opportunity.name}</TableCell>
              <TableCell>{opportunity.customerName}</TableCell>
              <TableCell>{formatAmount(opportunity.amount)}</TableCell>
              <TableCell>
                <StageBadge stage={opportunity.stage} />
              </TableCell>
              <TableCell className='text-right'>
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={() => void navigate(`${opportunity.id}/edit`)}
                >
                  {t('crm.common.edit')}
                </Button>
              </TableCell>
            </tr>
          ))}
        </DataTable>
      ) : null}

      <Outlet />
    </PageContainer>
  );
}
