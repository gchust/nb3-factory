import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Loading } from '@/components/loading';
import {
  assignRepair,
  getSessionContext,
  listPeople,
  listRepairs,
  useAsync,
} from '@/components/inspection/api.js';
import { formatDateTime } from '@/components/inspection/format.js';
import {
  PriorityBadge,
  RepairStatusBadge,
} from '@/components/inspection/status-badge.js';
import type { RepairOrder } from '@/components/inspection/types.js';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function RepairsPage(): ReactElement {
  const { t } = useTranslation();
  const repairs = useAsync('repairs', listRepairs);
  const session = useAsync('session', getSessionContext);
  const isManager = isManagerRole(session.data?.roles);

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={t('repairs.title')}
        description={t('repairs.description')}
      />
      {repairs.loading ? (
        <Loading label={t('status.loading')} />
      ) : repairs.error ? (
        <p role='alert' className='text-sm text-destructive'>
          {t('repairs.loadFailed')}
        </p>
      ) : (repairs.data ?? []).length === 0 ? (
        <p className='text-sm text-muted-foreground'>{t('repairs.empty')}</p>
      ) : (
        <div className='rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('repairs.code')}</TableHead>
                <TableHead>{t('repairs.equipment')}</TableHead>
                <TableHead>{t('repairs.source')}</TableHead>
                <TableHead>{t('repairs.assignee')}</TableHead>
                <TableHead>{t('repairs.priority')}</TableHead>
                <TableHead>{t('repairs.status')}</TableHead>
                <TableHead>{t('repairs.createdAt')}</TableHead>
                <TableHead>{t('repairs.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(repairs.data ?? []).map((order) => (
                <TableRow key={order.id}>
                  <TableCell className='font-medium'>{order.code}</TableCell>
                  <TableCell>
                    {order.equipmentCode} {order.equipmentName}
                  </TableCell>
                  <TableCell
                    className='max-w-56 truncate'
                    title={order.sourceTitle ?? ''}
                  >
                    {order.sourceTitle ?? '-'}
                  </TableCell>
                  <TableCell>
                    {isManager ? (
                      <AssignSelect order={order} onChanged={repairs.reload} />
                    ) : (
                      (order.assigneeName ?? t('repairs.unassigned'))
                    )}
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={order.priority} />
                  </TableCell>
                  <TableCell>
                    <RepairStatusBadge status={order.status} />
                  </TableCell>
                  <TableCell>{formatDateTime(order.createdAt)}</TableCell>
                  <TableCell>
                    <Link
                      to={`/repairs/${order.id}`}
                      className='text-sm font-medium text-primary hover:underline'
                    >
                      {t('repairs.open')}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </PageContainer>
  );
}

function AssignSelect(props: {
  readonly order: RepairOrder;
  readonly onChanged: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const people = useAsync('people', listPeople);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Base UI's Select.Value resolves the trigger label from the `items` prop,
  // not from the rendered SelectItem children. Without it the trigger shows
  // the raw user id instead of the repairer's name.
  const items = [
    { value: '__none__', label: t('repairs.unassigned') },
    ...(people.data?.repairers ?? []).map((person) => ({
      value: person.id,
      label: person.name,
    })),
  ];

  async function change(value: string): Promise<void> {
    setBusy(true);
    setError('');
    try {
      await assignRepair(
        api,
        props.order.id,
        value === '__none__' ? null : value,
      );
      props.onChanged();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t('repairs.assignFailed'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className='flex items-center gap-2'>
      <Select
        items={items}
        value={props.order.assigneeId ?? '__none__'}
        onValueChange={(value) => void change(value ?? '__none__')}
        disabled={busy}
      >
        <SelectTrigger className='h-8 w-40'>
          <SelectValue placeholder={t('repairs.unassigned')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='__none__'>{t('repairs.unassigned')}</SelectItem>
          {(people.data?.repairers ?? []).map((person) => (
            <SelectItem key={person.id} value={person.id}>
              {person.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? <Badge variant='destructive'>{error}</Badge> : null}
    </div>
  );
}

function isManagerRole(roles: readonly string[] | undefined): boolean {
  return Boolean(
    roles?.some(
      (role) => role === 'system-administrator' || role === 'equipment-manager',
    ),
  );
}
