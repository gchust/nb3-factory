import { useTranslation } from '@nocobase/i18n/client';
import { Link } from 'react-router';
import type { ReactElement } from 'react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import {
  formatDateTime,
  priorityLabel,
  regionLabel,
  ticketStatusLabel,
} from '../lib/format.js';
import type { Ticket } from '../lib/types.js';

import { StatusBadge } from './status-badge.js';

export function TicketTable({
  tickets,
}: {
  readonly tickets: readonly Ticket[];
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('service.tickets.no')}</TableHead>
          <TableHead>{t('service.tickets.title')}</TableHead>
          <TableHead>{t('service.tickets.customer')}</TableHead>
          <TableHead>{t('service.tickets.status')}</TableHead>
          <TableHead>{t('service.tickets.priority')}</TableHead>
          <TableHead>{t('service.tickets.region')}</TableHead>
          <TableHead>{t('service.tickets.updatedAt')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tickets.map((ticket) => (
          <TableRow key={ticket.id}>
            <TableCell className='font-mono text-xs'>
              <Link
                className='text-primary hover:underline'
                to={`/service/tickets/${ticket.id}`}
              >
                {ticket.ticketNo}
              </Link>
            </TableCell>
            <TableCell className='max-w-xs truncate' title={ticket.title}>
              {ticket.title}
            </TableCell>
            <TableCell className='max-w-48 truncate'>
              {ticket.customerName ?? '—'}
              {ticket.deviceName ? (
                <span className='block text-xs text-muted-foreground'>
                  {ticket.deviceCode} · {ticket.deviceName}
                </span>
              ) : null}
            </TableCell>
            <TableCell>
              <StatusBadge
                label={ticketStatusLabel(t, ticket.status)}
                value={ticket.status}
              />
            </TableCell>
            <TableCell>
              <StatusBadge
                label={priorityLabel(t, ticket.priority)}
                value={ticket.priority}
              />
            </TableCell>
            <TableCell>{regionLabel(t, ticket.region)}</TableCell>
            <TableCell className='whitespace-nowrap text-xs text-muted-foreground'>
              {formatDateTime(ticket.updatedAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
