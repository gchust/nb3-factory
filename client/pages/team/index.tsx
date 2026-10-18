import { useTranslation } from '@nocobase/i18n/client';
import { RefreshCwIcon } from 'lucide-react';
import { type ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Card, CardContent } from '#components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#components/ui/empty';
import { Skeleton } from '#components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import {
  useEngineers,
  useTicketDashboard,
  type EngineerOption,
} from '#hooks/itsm';

/** Who may be assigned work, and how much each of them is carrying. */
export default function TeamPage(): ReactElement {
  const { t } = useTranslation();
  const engineers = useEngineers();
  const dashboard = useTicketDashboard();

  return (
    <PageContainer>
      <PageHeader
        title={t('team.title')}
        description={t('team.description')}
        actions={
          <Button
            type='button'
            variant='outline'
            disabled={engineers.isFetching}
            onClick={() => {
              void engineers.refetch();
              void dashboard.refetch();
            }}
          >
            <RefreshCwIcon data-icon='inline-start' />
            {t('actions.refresh')}
          </Button>
        }
      />

      {engineers.isError ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('team.error.title')}</AlertTitle>
          <AlertDescription>{t('team.error.description')}</AlertDescription>
          <AlertAction>
            <Button
              type='button'
              size='sm'
              variant='secondary'
              onClick={() => void engineers.refetch()}
            >
              {t('actions.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : engineers.data ? (
        <EngineerTable
          engineers={engineers.data}
          workloads={dashboard.data?.workloads ?? []}
        />
      ) : (
        <Skeleton className='h-64 w-full' />
      )}
    </PageContainer>
  );
}

function EngineerTable({
  engineers,
  workloads,
}: {
  readonly engineers: readonly EngineerOption[];
  readonly workloads: readonly {
    readonly engineerId: string;
    readonly engineerName: string;
    readonly active: number;
    readonly resolved: number;
  }[];
}): ReactElement {
  const { t } = useTranslation();

  if (engineers.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{t('team.empty.title')}</EmptyTitle>
          <EmptyDescription>{t('team.empty.description')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Card>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('team.columns.name')}</TableHead>
              <TableHead>{t('team.columns.email')}</TableHead>
              <TableHead className='text-end'>
                {t('team.columns.active')}
              </TableHead>
              <TableHead className='text-end'>
                {t('team.columns.resolved')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {engineers.map((engineer) => {
              const workload = workloads.find(
                (item) => item.engineerId === engineer.id,
              );
              return (
                <TableRow key={engineer.id}>
                  <TableCell className='font-medium'>{engineer.name}</TableCell>
                  <TableCell className='text-muted-foreground'>
                    {engineer.email}
                  </TableCell>
                  <TableCell className='text-end'>
                    {workload?.active ?? 0}
                  </TableCell>
                  <TableCell className='text-end'>
                    {workload?.resolved ?? 0}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
