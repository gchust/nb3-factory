import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import {
  WorkflowManagementLayout,
  type WorkflowTab,
} from '#extensions/nocobase-workflow-management/layout';
import HelpdeskDefinitionsPage from './definitions.js';

export default function HelpdeskWorkflowPage(): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const tab: WorkflowTab = location.pathname.includes('/executions')
    ? 'executions'
    : 'definitions';
  const detail = /\/(definitions|executions)\/[^/]+$/.test(location.pathname);
  // The definitions list is the index of this settings section, so the shell
  // renders it directly instead of registering a second page at this path;
  // the router allows one page per path.
  const index = /\/helpdesk-workflow\/?$/.test(location.pathname);
  return (
    <WorkflowManagementLayout
      title={t('helpdesk.workflow.title')}
      description={t('helpdesk.workflow.description')}
      labels={{
        definitions: t('helpdesk.workflow.tabs.definitions'),
        executions: t('helpdesk.workflow.tabs.executions'),
      }}
      tab={tab}
      detail={detail}
      onTabChange={(next) => {
        void navigate(`/settings/helpdesk-workflow/${next}`, {
          replace: true,
        });
      }}
    >
      {index ? <HelpdeskDefinitionsPage /> : <Outlet />}
    </WorkflowManagementLayout>
  );
}
