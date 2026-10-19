import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useQuery } from '@tanstack/react-query';
import { ArrowRightIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { buttonVariants } from '#components/ui/button';

import { getDashboard, shouldRetryRequest } from '../it-tickets/api.js';
import { TicketDashboardSection } from '../it-tickets/dashboard.js';

/**
 * The signed-in landing page is the service desk overview, not the template's
 * builder introduction. People arriving at `/` need to know what is waiting,
 * what is late, and who is carrying the load.
 */
export default function HomePage(): ReactElement {
  const api = useApiClient();
  const { t } = useTranslation();
  const dashboard = useQuery({
    queryKey: ['it-tickets', 'dashboard'],
    queryFn: ({ signal }) => getDashboard(api, signal),
    staleTime: 15_000,
    retry: shouldRetryRequest,
  });

  return (
    <PageContainer>
      <PageHeader
        title={t('itTickets.title')}
        description={t('itTickets.description')}
        actions={
          <Link className={buttonVariants()} to='/it-tickets'>
            {t('itTickets.actions.viewTickets')}
            <ArrowRightIcon data-icon='inline-end' />
          </Link>
        }
      />
      <TicketDashboardSection
        dashboard={dashboard.data?.data}
        loading={dashboard.isPending}
        error={dashboard.error}
        onRetry={() => void dashboard.refetch()}
      />
    </PageContainer>
  );
}
