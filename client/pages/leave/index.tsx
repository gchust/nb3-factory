import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { CalendarDays, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Button } from '#components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#components/ui/tabs';
import { SettingsError } from '../settings/shared.js';
import { LeaveCalendar } from './calendar.js';
import { apiPath, useLeaveResource } from './data.js';
import { LeaveRequestTable } from './request-table.js';
import { LeaveStatsCards } from './stats.js';
import type {
  LeaveListResponse,
  LeaveStatsResponse,
  LeaveStatus,
  LeaveType,
} from './types.js';

const DECISION = {
  resource: { type: 'settings', id: 'leave.approvals' },
  action: 'decide',
} as const;

export interface LeaveContext {
  readonly reload: () => void;
}

export default function LeavePage() {
  const { t } = useTranslation();
  const location = useLocation();
  const canApprove = useCan(DECISION).can;
  const [tab, setTab] = useState('mine');
  const [status, setStatus] = useState<LeaveStatus | 'all'>('all');
  const [type, setType] = useState<LeaveType | 'all'>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [teamPage, setTeamPage] = useState(1);
  const [teamStatus, setTeamStatus] = useState<LeaveStatus | 'all'>('pending');
  const [teamType, setTeamType] = useState<LeaveType | 'all'>('all');

  const stats = useLeaveResource<LeaveStatsResponse>('leaveRequests/stats');
  const mine = useLeaveResource<LeaveListResponse>(
    apiPath('leaveRequests', {
      scope: 'mine',
      status: status === 'all' ? undefined : status,
      type: type === 'all' ? undefined : type,
      page,
      pageSize,
    }),
    { keepPreviousData: true },
  );
  const team = useLeaveResource<LeaveListResponse>(
    apiPath('leaveRequests', {
      scope: 'team',
      status: teamStatus === 'all' ? undefined : teamStatus,
      type: teamType === 'all' ? undefined : teamType,
      page: teamPage,
      pageSize,
    }),
    { enabled: canApprove, keepPreviousData: true },
  );

  const reload = () => {
    stats.reload();
    mine.reload();
    team.reload();
  };

  return (
    <>
      <PageContainer>
        <PageHeader
          title={t('leave.page.title')}
          description={t('leave.page.description')}
          actions={
            <Button
              nativeButton={false}
              render={
                <Link
                  to={{ pathname: '/leave/new', search: location.search }}
                />
              }
            >
              <PlusIcon data-icon='inline-start' />
              {t('leave.actions.new')}
            </Button>
          }
        />
        <LeaveStatsCards stats={stats.data?.data} showTeam={canApprove} />
        <Tabs
          value={tab}
          onValueChange={(value) => {
            setTab(String(value));
            if (value === 'team') setTeamPage(1);
          }}
          className='gap-4'
        >
          <TabsList>
            <TabsTrigger value='mine'>{t('leave.tabs.mine')}</TabsTrigger>
            {canApprove && (
              <TabsTrigger value='approvals'>
                {t('leave.tabs.approvals')}
              </TabsTrigger>
            )}
            <TabsTrigger value='team'>{t('leave.tabs.team')}</TabsTrigger>
          </TabsList>
          <TabsContent value='mine'>
            {mine.error != null ? (
              <SettingsError error={mine.error} retry={mine.reload} />
            ) : (
              <LeaveRequestTable
                rows={mine.data?.data ?? []}
                total={mine.data?.meta.total ?? 0}
                page={page}
                pageSize={pageSize}
                loading={mine.loading}
                status={status}
                onStatusChange={(value) => {
                  setStatus(value);
                  setPage(1);
                }}
                type={type}
                onTypeChange={(value) => {
                  setType(value);
                  setPage(1);
                }}
                onPageChange={setPage}
                onPageSizeChange={(value) => {
                  setPageSize(value);
                  setPage(1);
                }}
                showEmployee={false}
                search={location.search}
              />
            )}
          </TabsContent>
          {canApprove && (
            <TabsContent value='approvals'>
              {team.error != null ? (
                <SettingsError error={team.error} retry={team.reload} />
              ) : (
                <LeaveRequestTable
                  rows={team.data?.data ?? []}
                  total={team.data?.meta.total ?? 0}
                  page={teamPage}
                  pageSize={pageSize}
                  loading={team.loading}
                  status={teamStatus}
                  onStatusChange={(value) => {
                    setTeamStatus(value);
                    setTeamPage(1);
                  }}
                  type={teamType}
                  onTypeChange={(value) => {
                    setTeamType(value);
                    setTeamPage(1);
                  }}
                  onPageChange={setTeamPage}
                  onPageSizeChange={(value) => {
                    setPageSize(value);
                    setTeamPage(1);
                  }}
                  showEmployee
                  search={location.search}
                />
              )}
            </TabsContent>
          )}
          <TabsContent value='team'>
            <div className='flex items-center gap-2 text-sm text-muted-foreground'>
              <CalendarDays className='size-4' />
              {t('leave.calendar.description')}
            </div>
            <div className='mt-3'>
              <LeaveCalendar />
            </div>
          </TabsContent>
        </Tabs>
      </PageContainer>
      <Outlet context={{ reload } satisfies LeaveContext} />
    </>
  );
}
