import { useTranslation } from '@nocobase/i18n/client';
import {
  AlertTriangle,
  CalendarClock,
  ClipboardCheck,
  Clock,
} from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { getDashboard, useAsync } from '@/components/inspection/api.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loading } from '@/components/loading';

const CARDS = [
  {
    key: 'pending',
    labelKey: 'workbench.pending',
    icon: Clock,
    to: '/inspections',
  },
  {
    key: 'overdue',
    labelKey: 'workbench.overdue',
    icon: CalendarClock,
    to: '/inspections',
  },
  {
    key: 'abnormal',
    labelKey: 'workbench.abnormal',
    icon: AlertTriangle,
    to: '/inspections',
  },
  {
    key: 'pendingReview',
    labelKey: 'workbench.pendingReview',
    icon: ClipboardCheck,
    to: '/review',
  },
] as const;

export default function HomePage(): ReactElement {
  const { t } = useTranslation();
  const dashboard = useAsync('dashboard', getDashboard);

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={t('workbench.title')}
        description={t('workbench.description')}
      />
      {dashboard.loading ? (
        <Loading label={t('status.loading')} />
      ) : dashboard.error ? (
        <p role='alert' className='text-sm text-destructive'>
          {t('workbench.loadFailed')}
        </p>
      ) : (
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          {CARDS.map((card) => (
            <DashboardCard
              key={card.key}
              label={t(card.labelKey)}
              to={card.to}
              value={dashboard.data?.[card.key] ?? 0}
              icon={<card.icon className='size-5' />}
            />
          ))}
        </div>
      )}
    </PageContainer>
  );
}

function DashboardCard(props: {
  readonly label: string;
  readonly value: number;
  readonly to: string;
  readonly icon: ReactElement;
}): ReactElement {
  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
        <CardTitle className='text-sm font-medium text-muted-foreground'>
          {props.label}
        </CardTitle>
        <span className='text-muted-foreground'>{props.icon}</span>
      </CardHeader>
      <CardContent>
        <Link
          to={props.to}
          className='text-3xl font-semibold tracking-tight hover:underline'
        >
          {props.value}
        </Link>
      </CardContent>
    </Card>
  );
}
