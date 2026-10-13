import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { SearchIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Loading } from '#components/loading';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RequestFailed } from '#components/request-failed';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '#components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Spinner } from '#components/ui/spinner';
import { useApiErrorMessage } from '#hooks/api-error-message';
import {
  setStaffRole,
  useDirectory,
  useServiceDeskMe,
  useStaff,
  type ServiceDeskUser,
} from '#hooks/service-desk';
import { useUrlSearch } from '#hooks/use-url-search';
type StaffRole = 'employee' | 'engineer' | 'helpdesk';

interface Member {
  readonly user: ServiceDeskUser;
  readonly role: StaffRole;
}

/**
 * Who works the service desk.
 *
 * The roles live in the application's own table rather than in an authorization permission set: the record scope
 * (own / assigned / all) and the ticket state machine read them inside the transition's own transaction, which a
 * page grant cannot express. This page is the way the service desk manages them, and the server enforces that only
 * the service desk may.
 */
export default function ServiceDeskSettingsPage(): ReactElement {
  const { t } = useTranslation();
  const me = useServiceDeskMe();
  const isHelpdesk = me.data?.helpdesk ?? false;
  const staff = useStaff(isHelpdesk);
  const search = useUrlSearch({ param: 'q', resetParams: [] });
  const directory = useDirectory(search.search, isHelpdesk);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const api = useApiClient();
  const toaster = useToaster();
  const describeError = useApiErrorMessage();
  const staffReload = staff.reload;
  const directoryReload = directory.reload;

  const staffIds = new Set((staff.data ?? []).map((member) => member.user.id));
  const members: readonly Member[] = [
    ...(staff.data ?? []).map((member): Member => ({
      user: member.user,
      role: member.role,
    })),
    ...(directory.data ?? [])
      .filter((user) => !staffIds.has(user.id))
      .map((user): Member => ({ user, role: 'employee' })),
  ];

  async function change(userId: string, role: StaffRole): Promise<void> {
    setPendingId(userId);
    try {
      await setStaffRole(api, userId, role === 'employee' ? null : role);
    } catch (error) {
      toaster.show({ type: 'error', title: describeError(error) });
      return;
    } finally {
      setPendingId(null);
    }
    toaster.show({ type: 'success', title: t('serviceDesk.settings.saved') });
    staffReload();
    directoryReload();
  }

  if (me.error && !me.data) {
    return (
      <PageContainer>
        <PageHeader title={t('serviceDesk.settings.title')} />
        <RequestFailed
          error={me.error}
          title={t('serviceDesk.error.title')}
          description={t('serviceDesk.error.requestFailed')}
          onRetry={me.reload}
        />
      </PageContainer>
    );
  }
  if (!me.data) {
    return (
      <PageContainer>
        <Loading />
      </PageContainer>
    );
  }
  if (!isHelpdesk) {
    return (
      <PageContainer>
        <PageHeader title={t('serviceDesk.settings.title')} />
        <RequestFailed
          error={undefined}
          title={t('serviceDesk.error.forbidden')}
          description={t('serviceDesk.settings.helpdeskOnly')}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('serviceDesk.settings.title')}
        description={t('serviceDesk.settings.description')}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('serviceDesk.settings.membersTitle')}</CardTitle>
          <CardDescription>
            {t('serviceDesk.settings.membersDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              {...search.inputProps}
              type='search'
              placeholder={t('serviceDesk.settings.searchPlaceholder')}
              aria-label={t('serviceDesk.settings.searchPlaceholder')}
            />
          </InputGroup>

          {staff.error && !staff.data ? (
            <RequestFailed
              error={staff.error}
              title={t('serviceDesk.error.title')}
              description={t('serviceDesk.error.requestFailed')}
              onRetry={staff.reload}
            />
          ) : staff.data === undefined && search.search === '' ? (
            <Loading />
          ) : members.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant='icon'>
                  <SearchIcon />
                </EmptyMedia>
                <EmptyTitle>
                  {t('serviceDesk.settings.noResultsTitle')}
                </EmptyTitle>
                <EmptyDescription>
                  {t('serviceDesk.settings.noResultsDescription')}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className='flex flex-col divide-y divide-border'>
              {members.map((member) => (
                <li
                  key={member.user.id}
                  className='flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0'
                >
                  <div className='min-w-0'>
                    <p className='truncate text-sm font-medium'>
                      {member.user.name}
                    </p>
                    <p className='truncate text-xs text-muted-foreground'>
                      {member.user.email}
                    </p>
                  </div>
                  <div className='flex items-center gap-2'>
                    <RoleSelect
                      value={member.role}
                      disabled={pendingId === member.user.id}
                      label={t('serviceDesk.settings.roleLabel')}
                      onChange={(role) => void change(member.user.id, role)}
                    />
                    {pendingId === member.user.id ? (
                      <Spinner className='text-muted-foreground' />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}

/** The role of one person. "Employee" is the absence of a row, which is what the server is sent for it. */
function RoleSelect({
  value,
  disabled,
  label,
  onChange,
}: {
  readonly value: StaffRole;
  readonly disabled: boolean;
  readonly label: string;
  readonly onChange: (role: StaffRole) => void;
}): ReactElement {
  const { t } = useTranslation();
  const items = [
    { value: 'employee', label: t('serviceDesk.settings.role.employee') },
    { value: 'engineer', label: t('serviceDesk.settings.role.engineer') },
    { value: 'helpdesk', label: t('serviceDesk.settings.role.helpdesk') },
  ];
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next: string | null) => {
        if (next) onChange(next as StaffRole);
      }}
    >
      <SelectTrigger aria-label={label} disabled={disabled} className='w-40'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
