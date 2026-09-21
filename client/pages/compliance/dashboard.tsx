import { useTranslation } from '@nocobase/i18n/client';
import {
  AlertOctagonIcon,
  CalendarClockIcon,
  FileWarningIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
  TruckIcon,
} from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { useAccess } from './access.js';
import {
  complianceRequest,
  normalizeError,
  type DashboardData,
  type NormalizedError,
  type RisksData,
} from './api.js';
import { ErrorState, LoadingState } from './components/state.js';

interface DashboardPayload {
  readonly dashboard: DashboardData;
  readonly risks: RisksData;
}

export default function ComplianceDashboardPage(): ReactElement {
  const { t } = useTranslation();
  const { api, loading: accessLoading, error: accessError } = useAccess();
  const [payload, setPayload] = useState<DashboardPayload>();
  const [error, setError] = useState<NormalizedError>();
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [dashboard, risks] = await Promise.all([
        complianceRequest<DashboardData>(api, '/dashboard'),
        complianceRequest<RisksData>(api, '/risks'),
      ]);
      setPayload({ dashboard, risks });
    } catch (cause) {
      setError(normalizeError(cause));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (accessLoading || accessError) return;
    // Defer to a microtask so the effect body itself does not synchronously update state.
    queueMicrotask(() => void reload());
  }, [accessLoading, accessError, reload]);

  if (accessLoading || loading) {
    return (
      <PageContainer>
        <LoadingState />
      </PageContainer>
    );
  }

  if (accessError) {
    return (
      <PageContainer>
        <ErrorState error={accessError} onRetry={() => void reload()} />
      </PageContainer>
    );
  }

  if (error || !payload) {
    return (
      <PageContainer>
        <ErrorState
          error={error ?? { status: 0, code: 'UNKNOWN', message: 'No data.' }}
          onRetry={() => void reload()}
        />
      </PageContainer>
    );
  }

  const { dashboard, risks } = payload;
  const riskCount =
    risks.qualifications.length +
    risks.contracts.length +
    risks.eligibility.length;

  return (
    <PageContainer>
      <PageHeader
        title={t('compliance.dashboard.title', {
          defaultValue: 'Compliance dashboard',
        })}
        description={t('compliance.dashboard.description', {
          defaultValue:
            'Supplier qualification, annual review and contract status at a glance.',
        })}
      />

      <section className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
        <StatCard
          icon={<TruckIcon className='size-4' />}
          label={t('compliance.dashboard.totalSuppliers', {
            defaultValue: 'Suppliers',
          })}
          value={dashboard.totals.suppliers}
          link='/compliance/suppliers'
        />
        <StatCard
          icon={<ShieldCheckIcon className='size-4' />}
          label={t('compliance.dashboard.qualifiedSuppliers', {
            defaultValue: 'Qualified suppliers',
          })}
          value={dashboard.totals.qualified}
          link='/compliance/suppliers'
        />
        <StatCard
          icon={<ScrollTextIcon className='size-4' />}
          label={t('compliance.dashboard.pendingReview', {
            defaultValue: 'Pending review',
          })}
          value={dashboard.totals.pendingReview}
          link='/compliance/suppliers'
        />
        <StatCard
          icon={<FileWarningIcon className='size-4' />}
          label={t('compliance.dashboard.rejected', {
            defaultValue: 'Rejected',
          })}
          value={dashboard.totals.rejected}
          link='/compliance/suppliers'
        />
        <StatCard
          icon={<ScrollTextIcon className='size-4' />}
          label={t('compliance.dashboard.contracts', {
            defaultValue: 'Contracts',
          })}
          value={dashboard.totals.contracts}
          link='/compliance/contracts'
        />
        <StatCard
          icon={<CalendarClockIcon className='size-4' />}
          label={t('compliance.dashboard.activeContracts', {
            defaultValue: 'Active contracts',
          })}
          value={dashboard.totals.activeContracts}
          link='/compliance/contracts'
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>
            {t('compliance.dashboard.riskTitle', {
              defaultValue: 'Risk reminders',
            })}
          </CardTitle>
          <CardDescription>
            {t('compliance.dashboard.riskDescription', {
              defaultValue:
                'Qualification and contract dates within the reminder window, plus qualified suppliers that no longer meet the catalog rule.',
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
          <RiskCounter
            label={t('compliance.dashboard.expiredQualifications', {
              defaultValue: 'Expired qualifications',
            })}
            value={dashboard.risk.expiredQualifications}
          />
          <RiskCounter
            label={t('compliance.dashboard.expiringQualifications', {
              defaultValue: 'Expiring qualifications',
            })}
            value={dashboard.risk.expiringQualifications}
          />
          <RiskCounter
            label={t('compliance.dashboard.expiringContracts', {
              defaultValue: 'Expiring contracts',
            })}
            value={dashboard.risk.expiringContracts}
          />
          <RiskCounter
            label={t('compliance.dashboard.ineligibleSuppliers', {
              defaultValue: 'Qualified but ineligible',
            })}
            value={dashboard.risk.ineligibleQualifiedSuppliers}
          />
        </CardContent>
        <CardContent className='flex flex-wrap items-center gap-2 pt-0'>
          <Button
            render={<Link to='/compliance/risks' />}
            variant='outline'
            size='sm'
          >
            <AlertOctagonIcon />
            {t('compliance.dashboard.viewRisks', {
              defaultValue: 'Open risk reminders ({{count}})',
              count: riskCount,
            })}
          </Button>
        </CardContent>
      </Card>
    </PageContainer>
  );
}

function StatCard({
  icon,
  label,
  value,
  link,
}: {
  readonly icon: ReactElement;
  readonly label: string;
  readonly value: number;
  readonly link: string;
}): ReactElement {
  return (
    <Card size='sm'>
      <CardHeader>
        <CardDescription className='flex items-center gap-2'>
          {icon}
          {label}
        </CardDescription>
        <CardTitle className='text-3xl'>{value}</CardTitle>
      </CardHeader>
      <CardContent className='pt-0'>
        <Button variant='link' size='sm' render={<Link to={link} />}>
          {label}
        </Button>
      </CardContent>
    </Card>
  );
}

function RiskCounter({
  label,
  value,
}: {
  readonly label: string;
  readonly value: number;
}): ReactElement {
  return (
    <div className='rounded-lg border border-border p-3'>
      <p className='text-2xl font-semibold'>{value}</p>
      <p className='text-xs text-muted-foreground'>{label}</p>
    </div>
  );
}
