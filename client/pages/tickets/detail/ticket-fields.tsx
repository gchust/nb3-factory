import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { ArrowRightIcon, MessageSquareIcon, PaperclipIcon } from 'lucide-react';
import { type ReactElement } from 'react';

import { FilePreviewField } from '#extensions/nocobase-file-component-ui/components/file-preview-field';
import { Separator } from '#components/ui/separator';
import { Skeleton } from '#components/ui/skeleton';

import { formatDateTime } from '../format.js';
import { TicketStatusBadge, TicketUrgencyBadge } from '../status.js';
import type { TicketDetail } from '../types.js';
import { useTicketFiles } from '../use-ticket-files.js';

/** The read-only part of the drawer: the ticket's fields, its screenshots and its history. */
export function TicketFields({
  detail,
}: {
  readonly detail: TicketDetail;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { ticket } = detail;

  return (
    <div className='flex flex-col gap-6'>
      <dl className='grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2'>
        <Field label={t('tickets.fields.status')}>
          <TicketStatusBadge status={ticket.status} />
        </Field>
        <Field label={t('tickets.fields.urgency')}>
          <TicketUrgencyBadge urgency={ticket.urgency} />
        </Field>
        <Field label={t('tickets.fields.requester')}>
          {ticket.requesterName}
        </Field>
        <Field label={t('tickets.fields.assignee')}>
          {ticket.assigneeName ?? t('tickets.unassigned')}
        </Field>
        <Field label={t('tickets.fields.createdAt')}>
          {formatDateTime(ticket.createdAt, locale)}
        </Field>
        <Field label={t('tickets.fields.statusChangedAt')}>
          {formatDateTime(ticket.statusChangedAt, locale)}
        </Field>
      </dl>

      <Separator />

      <section className='flex flex-col gap-2'>
        <h3 className='text-sm font-medium'>
          {t('tickets.fields.description')}
        </h3>
        <p className='text-sm break-words whitespace-pre-wrap text-muted-foreground'>
          {ticket.description}
        </p>
      </section>

      {ticket.resolution ? (
        <section className='flex flex-col gap-2'>
          <h3 className='text-sm font-medium'>
            {t('tickets.fields.resolution')}
          </h3>
          <p className='text-sm break-words whitespace-pre-wrap text-muted-foreground'>
            {ticket.resolution}
          </p>
        </section>
      ) : null}

      <section className='flex flex-col gap-2'>
        <h3 className='flex items-center gap-1.5 text-sm font-medium'>
          <PaperclipIcon className='size-4 text-muted-foreground' />
          {t('tickets.fields.attachments')}
        </h3>
        <TicketAttachments ids={ticket.attachmentIds ?? []} />
      </section>

      <Separator />

      <section className='flex flex-col gap-4'>
        <h3 className='text-sm font-medium'>{t('tickets.timeline.title')}</h3>
        <TicketTimeline detail={detail} />
      </section>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}): ReactElement {
  return (
    <div className='flex flex-col gap-1'>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='text-sm'>{children}</dd>
    </div>
  );
}

function TicketAttachments({
  ids,
}: {
  readonly ids: readonly string[];
}): ReactElement {
  const { t } = useTranslation();
  const { files, loading, error } = useTicketFiles(ids);

  if (!ids.length) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('tickets.attachments.empty')}
      </p>
    );
  }
  if (loading) {
    return (
      <div className='flex gap-2'>
        <Skeleton className='size-12' />
        <Skeleton className='size-12' />
      </div>
    );
  }
  if (error) {
    return (
      <p className='text-sm text-destructive'>
        {t('tickets.attachments.error')}
      </p>
    );
  }
  return <FilePreviewField files={files} showFilenames />;
}

interface TimelineEntry {
  readonly key: string;
  readonly kind: 'transition' | 'note';
  readonly title: string;
  readonly actor: string;
  readonly createdAt: string;
  readonly content?: string;
}

function TicketTimeline({
  detail,
}: {
  readonly detail: TicketDetail;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();

  const entries: TimelineEntry[] = [
    ...detail.transitions.map((transition) => ({
      key: `transition-${transition.id}`,
      kind: 'transition' as const,
      title: t(`tickets.timeline.action.${transition.action}`, {
        defaultValue: transition.action,
      }),
      actor: transition.actorName,
      createdAt: transition.createdAt,
    })),
    ...detail.notes.map((note) => ({
      key: `note-${note.id}`,
      kind: 'note' as const,
      title: t('tickets.timeline.note'),
      actor: note.authorName,
      createdAt: note.createdAt,
      content: note.content,
    })),
  ].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

  if (!entries.length) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('tickets.timeline.empty')}
      </p>
    );
  }

  return (
    <ol className='flex flex-col gap-4'>
      {entries.map((entry) => (
        <li key={entry.key} className='flex gap-3'>
          <span
            aria-hidden='true'
            className='mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground'
          >
            {entry.kind === 'note' ? (
              <MessageSquareIcon className='size-3.5' />
            ) : (
              <ArrowRightIcon className='size-3.5' />
            )}
          </span>
          <div className='flex min-w-0 flex-col gap-0.5'>
            <p className='text-sm'>
              <span className='font-medium'>{entry.title}</span>{' '}
              <span className='text-muted-foreground'>
                {t('tickets.timeline.by', { name: entry.actor })}
              </span>
            </p>
            <time
              dateTime={entry.createdAt}
              className='text-xs text-muted-foreground'
            >
              {formatDateTime(entry.createdAt, locale)}
            </time>
            {entry.content ? (
              <p className='mt-1 text-sm break-words whitespace-pre-wrap text-muted-foreground'>
                {entry.content}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
