import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import {
  matchPath,
  Navigate,
  NavLink,
  Outlet,
  useLocation,
  useResolvedPath,
} from 'react-router';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';

import { useTrainingViewer } from '../client.js';
import { DeniedBlock, ErrorBlock, LoadingBlock } from '../components.js';

export default function TrainingManagePage(): ReactElement {
  const { t } = useTranslation();
  const viewer = useTrainingViewer();
  const location = useLocation();
  const parentPath = useResolvedPath('.');
  const isParentEntry = matchPath(
    { path: parentPath.pathname, end: true },
    location.pathname,
  );

  if (viewer.loading) {
    return (
      <PageContainer>
        <LoadingBlock />
      </PageContainer>
    );
  }

  if (viewer.error) {
    return (
      <PageContainer>
        <PageHeader title={t('training.manage.title')} />
        <ErrorBlock message={viewer.error} onRetry={viewer.reload} />
      </PageContainer>
    );
  }

  if (!viewer.data?.isAdmin) {
    return (
      <PageContainer>
        <PageHeader title={t('training.manage.title')} />
        <DeniedBlock message={t('training.errors.adminOnly')} />
      </PageContainer>
    );
  }

  if (isParentEntry) {
    return (
      <Navigate to={{ pathname: 'courses', search: location.search }} replace />
    );
  }

  const tabClass = ({ isActive }: { isActive: boolean }): string =>
    isActive
      ? 'rounded-lg bg-muted px-3 py-1.5 text-sm font-medium text-foreground'
      : 'rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground';

  return (
    <PageContainer>
      <Breadcrumbs />
      <PageHeader
        title={t('training.manage.title')}
        description={t('training.manage.description')}
      />
      <nav
        className='flex gap-2 border-b border-border pb-2'
        aria-label={t('training.manage.title')}
      >
        <NavLink className={tabClass} to={{ pathname: 'courses' }}>
          {t('training.manage.tabs.courses')}
        </NavLink>
        <NavLink className={tabClass} to={{ pathname: 'sessions' }}>
          {t('training.manage.tabs.sessions')}
        </NavLink>
      </nav>
      <Outlet />
    </PageContainer>
  );
}
