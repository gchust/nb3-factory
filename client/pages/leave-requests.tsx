import { useTranslation } from '@nocobase/i18n/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loading } from '@/components/loading';
import { useClientApplication, useService } from '@nocobase/app-client';
import { apiClientToken } from '@nocobase/app-client';

import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Plus, Paperclip, Inbox } from 'lucide-react';

import {
  formatDateTime,
  type LeaveRequestSummary,
  type LeaveRequestListResponse,
  type LeaveRequestStatus,
} from '@/lib/leave-requests';

function statusVariant(
  status: LeaveRequestStatus,
): 'default' | 'secondary' | 'destructive' {
  switch (status) {
    case 'approved':
      return 'default';
    case 'rejected':
      return 'destructive';
    default:
      return 'secondary';
  }
}

export default function LeaveRequestsPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const app = useClientApplication();
  const api = useService(apiClientToken);
  const [requests, setRequests] = useState<readonly LeaveRequestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .request<LeaveRequestListResponse>({
        method: 'GET',
        path: 'leave-requests',
      })
      .then((response) => {
        if (cancelled) return;
        setRequests(response.data);
        setLoading(false);
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const err = e as { message?: string };
        void app;
        setError(
          err.message ??
            t('leaveRequests.error.unexpected', { defaultValue: '加载失败' }),
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, app, t]);

  const locale = i18n.language;

  return (
    <section className='mx-auto w-full max-w-5xl px-6 py-10'>
      <div className='mb-6 flex items-center justify-between gap-4'>
        <div>
          <h1 className='text-2xl font-semibold tracking-tight'>
            {t('leaveRequests.title')}
          </h1>
          <p className='mt-1 text-sm text-muted-foreground'>
            {t('leaveRequests.list.description')}
          </p>
        </div>
        <Button onClick={() => void navigate('/leave-requests/create')}>
          <Plus className='size-4' />
          {t('leaveRequests.actions.create')}
        </Button>
      </div>

      {error ? (
        <Card>
          <CardContent className='py-8 text-center text-sm text-destructive'>
            {error}
          </CardContent>
        </Card>
      ) : loading ? (
        <Loading label={t('leaveRequests.list.loading')} />
      ) : requests.length === 0 ? (
        <Card>
          <CardContent className='flex flex-col items-center gap-3 py-10 text-center'>
            <Inbox className='size-8 text-muted-foreground' />
            <p className='text-sm text-muted-foreground'>
              {t('leaveRequests.list.empty')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>
              {t('leaveRequests.list.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className='p-0'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('leaveRequests.fields.applicant')}</TableHead>
                  <TableHead>{t('leaveRequests.fields.type')}</TableHead>
                  <TableHead>{t('leaveRequests.fields.period')}</TableHead>
                  <TableHead className='text-right'>
                    {t('leaveRequests.fields.days')}
                  </TableHead>
                  <TableHead>{t('leaveRequests.fields.status')}</TableHead>
                  <TableHead className='text-center'>
                    {t('leaveRequests.fields.evidence')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((request) => (
                  <TableRow
                    key={request.id}
                    className='cursor-pointer'
                    onClick={() =>
                      void navigate(`/leave-requests/${request.id}`)
                    }
                  >
                    <TableCell className='font-medium'>
                      {request.applicantName}
                    </TableCell>
                    <TableCell>
                      {t(`leaveRequests.types.${request.type}`)}
                    </TableCell>
                    <TableCell className='whitespace-nowrap'>
                      {formatDateTime(request.startAt, locale)}
                      {' – '}
                      {formatDateTime(request.endAt, locale)}
                    </TableCell>
                    <TableCell className='text-right'>{request.days}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(request.status)}>
                        {t(`leaveRequests.statuses.${request.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className='text-center'>
                      {request.evidenceCount > 0 ? (
                        <span className='inline-flex items-center gap-1 text-muted-foreground'>
                          <Paperclip className='size-3.5' />
                          {request.evidenceCount}
                        </span>
                      ) : (
                        <span className='text-muted-foreground'>–</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
