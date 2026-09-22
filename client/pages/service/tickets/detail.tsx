import { useTranslation } from '@nocobase/i18n/client';
import { useService } from '@nocobase/app-client';
import { useState, type ReactElement, type ReactNode } from 'react';
import { useParams } from 'react-router';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { RouteChildPage } from '@/components/route-child-page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { clientFileRepositoryManagerToken } from '../../../extensions/nocobase-file-component-ui/index.js';

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../components/data-states.js';
import { FileAttachments } from '../components/file-attachments.js';
import { StatusBadge } from '../components/status-badge.js';
import { TicketActions } from '../components/ticket-actions.js';
import {
  formatDateTime,
  logActionLabel,
  priorityLabel,
  regionLabel,
  ticketStatusLabel,
} from '../lib/format.js';
import { useCaller, useServiceClient } from '../lib/use-service.js';
import { useServiceQuery } from '../lib/use-service-query.js';

export default function ServiceTicketDetailPage(): ReactElement {
  const { t } = useTranslation();
  const params = useParams();
  const id = params.id ?? '';
  const client = useServiceClient();
  const caller = useCaller();
  const repositoryManager = useService(clientFileRepositoryManagerToken);
  const repository = repositoryManager.repository('serviceFiles');
  const [shareUserId, setShareUserId] = useState('');

  const detail = useServiceQuery(() => client.ticket(id), `ticket:${id}`);
  const members = useServiceQuery(
    () =>
      caller.data?.caller.capabilities['tickets.share']
        ? client.listMembers()
        : Promise.resolve([]),
    `ticket-members:${id}:${caller.data?.caller.capabilities['tickets.share'] === true}`,
  );

  const caps = caller.data?.caller.capabilities ?? {};

  const grantShare = async () => {
    await client.shareTicket(id, shareUserId, true);
    setShareUserId('');
    detail.reload();
  };

  const revokeShare = async (userId: string) => {
    await client.shareTicket(id, userId, false);
    detail.reload();
  };

  return (
    <RouteChildPage>
      <PageContainer className='mx-auto max-w-5xl'>
        <Breadcrumbs />
        {detail.loading && !detail.data ? <LoadingState /> : null}
        {detail.error ? (
          <ErrorState error={detail.error} onRetry={detail.reload} />
        ) : null}
        {detail.data && caller.data ? (
          <>
            <PageHeader
              actions={
                <TicketActions
                  caller={caller.data.caller}
                  client={client}
                  members={members.data ?? []}
                  onChanged={() => detail.reload()}
                  ticket={detail.data.ticket}
                />
              }
              description={detail.data.ticket.title}
              title={detail.data.ticket.ticketNo}
            />
            <div className='flex flex-wrap items-center gap-2'>
              <StatusBadge
                label={ticketStatusLabel(t, detail.data.ticket.status)}
                value={detail.data.ticket.status}
              />
              <StatusBadge
                label={priorityLabel(t, detail.data.ticket.priority)}
                value={detail.data.ticket.priority}
              />
              <Badge variant='outline'>
                {regionLabel(t, detail.data.ticket.region)}
              </Badge>
              {detail.data.ticket.confidential ? (
                <Badge variant='destructive'>
                  {t('service.tickets.confidential')}
                </Badge>
              ) : null}
              {detail.data.ticket.source === 'integration' ? (
                <Badge variant='outline'>
                  {t('service.tickets.sourceIntegration')}
                </Badge>
              ) : null}
            </div>
            <div className='grid gap-6 lg:grid-cols-3'>
              <div className='space-y-6 lg:col-span-2'>
                <Card>
                  <CardHeader>
                    <CardTitle>{t('service.tickets.overview')}</CardTitle>
                  </CardHeader>
                  <CardContent className='grid gap-4 sm:grid-cols-2'>
                    <Field label={t('service.tickets.customer')}>
                      {detail.data.customer?.name ?? '—'}
                    </Field>
                    <Field label={t('service.tickets.device')}>
                      {detail.data.device
                        ? `${detail.data.device.code} · ${detail.data.device.name}`
                        : '—'}
                    </Field>
                    <Field label={t('service.tickets.reporter')}>
                      {detail.data.ticket.reporterName ??
                        detail.data.ticket.reporterId ??
                        '—'}
                    </Field>
                    <Field label={t('service.tickets.assignee')}>
                      {detail.data.ticket.assigneeId ?? '—'}
                    </Field>
                    <Field label={t('service.tickets.createdAt')}>
                      {formatDateTime(detail.data.ticket.createdAt)}
                    </Field>
                    <Field label={t('service.tickets.closedAt')}>
                      {formatDateTime(detail.data.ticket.closedAt)}
                    </Field>
                    {caps['tickets.process'] ? (
                      <Field label={t('service.tickets.laborHours')}>
                        {detail.data.ticket.laborHours ?? '—'}
                      </Field>
                    ) : null}
                    <div className='sm:col-span-2'>
                      <Field label={t('service.tickets.description')}>
                        {detail.data.ticket.description || '—'}
                      </Field>
                    </div>
                    {detail.data.ticket.resolution ? (
                      <div className='sm:col-span-2'>
                        <Field label={t('service.tickets.resolution')}>
                          {detail.data.ticket.resolution}
                        </Field>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>{t('service.tickets.logs')}</CardTitle>
                  </CardHeader>
                  <CardContent className='space-y-3'>
                    {detail.data.logs.length ? (
                      detail.data.logs.map((log) => (
                        <div
                          className='flex flex-col gap-1 border-l-2 border-border pl-3'
                          key={log.id}
                        >
                          <div className='flex flex-wrap items-center gap-2 text-sm'>
                            <span className='font-medium'>
                              {logActionLabel(t, log.action)}
                            </span>
                            <span className='text-muted-foreground'>
                              {log.operatorName}
                            </span>
                            <span className='text-xs text-muted-foreground'>
                              {formatDateTime(log.createdAt)}
                            </span>
                          </div>
                          {log.note ? (
                            <p className='text-sm text-muted-foreground'>
                              {log.note}
                            </p>
                          ) : null}
                          {log.reason ? (
                            <p className='text-sm text-destructive'>
                              {log.reason}
                            </p>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <EmptyState message={t('service.tickets.noLogs')} />
                    )}
                  </CardContent>
                </Card>
              </div>
              <div className='space-y-6'>
                <Card>
                  <CardHeader>
                    <CardTitle>{t('service.files.title')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <FileAttachments
                      canUpload={caps['tickets.edit'] === true}
                      files={detail.data.files}
                      onUploaded={async (fileIds) => {
                        await client.attachTicketFiles(id, fileIds);
                        detail.reload();
                      }}
                      repository={repository}
                    />
                  </CardContent>
                </Card>
                {caps['tickets.share'] ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>{t('service.tickets.shares')}</CardTitle>
                    </CardHeader>
                    <CardContent className='space-y-3'>
                      <div className='space-y-2'>
                        <Label htmlFor='shareUser'>
                          {t('service.tickets.shareWith')}
                        </Label>
                        <Select
                          value={shareUserId || null}
                          onValueChange={(value) =>
                            setShareUserId(value ? String(value) : '')
                          }
                        >
                          <SelectTrigger className='w-full' id='shareUser'>
                            <SelectValue
                              placeholder={t(
                                'service.tickets.sharePlaceholder',
                              )}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {members.data?.map((member) => (
                              <SelectItem
                                key={member.userId}
                                value={member.userId}
                              >
                                {member.userName ?? member.userId}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className='flex gap-2'>
                        <Button
                          disabled={!shareUserId}
                          onClick={() => void grantShare()}
                          size='sm'
                        >
                          {t('service.tickets.shareGrant')}
                        </Button>
                      </div>
                      <Separator />
                      {detail.data.shares.filter((share) => share.active)
                        .length ? (
                        detail.data.shares
                          .filter((share) => share.active)
                          .map((share) => (
                            <div
                              className='flex items-center justify-between text-sm'
                              key={share.id}
                            >
                              <span>{share.userId}</span>
                              <Button
                                onClick={() => void revokeShare(share.userId)}
                                size='xs'
                                variant='ghost'
                              >
                                {t('service.tickets.shareRevoke')}
                              </Button>
                            </div>
                          ))
                      ) : (
                        <p className='text-sm text-muted-foreground'>
                          {t('service.tickets.noShares')}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </PageContainer>
    </RouteChildPage>
  );
}

function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className='space-y-1'>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <p className='text-sm whitespace-pre-wrap break-words'>{children}</p>
    </div>
  );
}
