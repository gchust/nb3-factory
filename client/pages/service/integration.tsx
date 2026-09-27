import { useTranslation } from '@nocobase/i18n/client';
import { SendIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';

import {
  describeError,
  useResource,
  useServiceApi,
} from '../../service/api.js';
import { asNumber, asText, formatDateTime } from '../../service/format.js';
import { AlertNotice, QueryState, SectionCard } from '../../service/ui.js';

const EVENT_TYPES = [
  'device.fault.reported',
  'device.heartbeat',
  'ticket.status.changed',
];

/**
 * Device-platform integration. An external caller identifies itself with an API
 * key; the same idempotency key ingested twice is stored once and reported as a
 * replay rather than creating a second ticket.
 */
export default function IntegrationPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const events = useResource('service:integration-events', () =>
    api.listIntegrationEvents(50),
  );

  const [eventType, setEventType] = useState(EVENT_TYPES[0]);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [deviceSerial, setDeviceSerial] = useState('');
  const [ticketSerial, setTicketSerial] = useState('');
  const [payload, setPayload] = useState('');
  const [sending, setSending] = useState(false);

  const submit = async (): Promise<void> => {
    if (!idempotencyKey.trim()) return;
    let parsed: Record<string, unknown> | null = null;
    if (payload.trim()) {
      try {
        parsed = JSON.parse(payload) as Record<string, unknown>;
      } catch {
        toast.add({
          type: 'error',
          title: t('service.integration.invalidPayload'),
        });
        return;
      }
    }
    setSending(true);
    try {
      const result = await api.ingestEvent({
        eventType,
        idempotencyKey: idempotencyKey.trim(),
        deviceSerial: deviceSerial.trim() || undefined,
        ticketSerial: ticketSerial.trim() || undefined,
        payload: parsed,
      });
      toast.add({
        type: 'success',
        title: t('service.integration.ingested'),
        description: t('service.integration.ingestedDetail', {
          message: asText(result.message) || 'ok',
        }),
      });
      setIdempotencyKey('');
      setDeviceSerial('');
      setTicketSerial('');
      setPayload('');
      events.reload();
    } catch (error) {
      toast.add({
        type: 'error',
        title: t('service.integration.ingestFailed'),
        description: describeError(error),
      });
    } finally {
      setSending(false);
    }
  };

  const rows = events.data ?? [];

  return (
    <PageContainer>
      <PageHeader
        title={t('service.integration.title')}
        description={t('service.integration.description')}
      />

      <AlertNotice title={t('service.integration.apiKeyTitle')}>
        {t('service.integration.apiKeyHint')}
      </AlertNotice>

      <SectionCard title={t('service.integration.ingest')}>
        <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
          <div className='space-y-2'>
            <Label>{t('service.integration.eventType')}</Label>
            <Select
              items={EVENT_TYPES.map((value) => ({ value, label: value }))}
              value={eventType}
              onValueChange={(value: string | null) =>
                setEventType(value ?? EVENT_TYPES[0])
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='integration-key'>
              {t('service.integration.idempotencyKey')}
            </Label>
            <Input
              id='integration-key'
              value={idempotencyKey}
              onChange={(event) => setIdempotencyKey(event.target.value)}
              placeholder={t('service.integration.idempotencyPlaceholder')}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='integration-device'>
              {t('service.integration.deviceSerial')}
            </Label>
            <Input
              id='integration-device'
              value={deviceSerial}
              onChange={(event) => setDeviceSerial(event.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='integration-ticket'>
              {t('service.integration.ticketSerial')}
            </Label>
            <Input
              id='integration-ticket'
              value={ticketSerial}
              onChange={(event) => setTicketSerial(event.target.value)}
            />
          </div>
          <div className='space-y-2 md:col-span-2'>
            <Label htmlFor='integration-payload'>
              {t('service.integration.payload')}
            </Label>
            <Textarea
              id='integration-payload'
              rows={4}
              value={payload}
              placeholder='{"code":"E-102","temperature":87.5}'
              onChange={(event) => setPayload(event.target.value)}
            />
          </div>
        </div>
        <div className='mt-4'>
          <Button
            disabled={sending || !idempotencyKey.trim()}
            onClick={() => void submit()}
          >
            <SendIcon />
            {sending
              ? t('service.integration.sending')
              : t('service.integration.send')}
          </Button>
        </div>
      </SectionCard>

      <SectionCard title={t('service.integration.events')}>
        <QueryState
          loading={events.loading}
          error={events.error}
          empty={rows.length === 0}
          onRetry={events.reload}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('service.integration.idempotencyKey')}</TableHead>
                <TableHead>{t('service.integration.eventType')}</TableHead>
                <TableHead>{t('service.integration.deviceSerial')}</TableHead>
                <TableHead>{t('service.integration.status')}</TableHead>
                <TableHead>{t('service.integration.ticket')}</TableHead>
                <TableHead>{t('service.integration.receivedAt')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((event) => (
                <TableRow key={asText(event.id)}>
                  <TableCell className='font-mono text-xs'>
                    {asText(event.idempotencyKey)}
                  </TableCell>
                  <TableCell>{asText(event.eventType)}</TableCell>
                  <TableCell>{asText(event.deviceSerial) || '—'}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        asText(event.status) === 'rejected'
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {t(
                        `service.integration.eventStatus.${asText(event.status)}`,
                        {
                          defaultValue: asText(event.status),
                        },
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {asNumber(event.ticketId) ? (
                      <Link
                        className='font-medium hover:underline'
                        to={`/service/tickets/${asText(event.ticketId)}`}
                      >
                        {asText(event.ticketId)}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className='text-sm text-muted-foreground'>
                    {formatDateTime(event.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </QueryState>
      </SectionCard>
    </PageContainer>
  );
}
