import { useTranslation } from '@nocobase/i18n/client';
import {
  CalendarClockIcon,
  CheckCircle2Icon,
  InfoIcon,
  PlayIcon,
  WrenchIcon,
} from 'lucide-react';
import { type ReactElement, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';

import type { Ticket, TicketMeta, TicketStatus } from './types.js';

const STATUS_BADGE: Record<
  TicketStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending: 'outline',
  processing: 'secondary',
  completed: 'default',
};

function formatWhen(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export interface TicketDetailProps {
  readonly ticket: Ticket;
  readonly meta: TicketMeta;
  /** True while a start or complete request is in flight. */
  readonly busy?: boolean;
  readonly onStart: () => void | Promise<void>;
  readonly onComplete: (resolution: string) => void | Promise<void>;
}

/**
 * The full record of one ticket, with the controls an IT handler needs.
 *
 * The controls are rendered from the role the server reported and from the
 * ticket's own state: an employee sees no start or complete button, and a
 * completed ticket shows its resolution instead of any way to change it. That
 * is presentation only — the server re-checks both on every request.
 */
export function TicketDetail({
  ticket,
  meta,
  busy = false,
  onStart,
  onComplete,
}: TicketDetailProps): ReactElement {
  const { t } = useTranslation();
  const [completing, setCompleting] = useState(false);
  const [resolution, setResolution] = useState('');

  const completed = ticket.status === 'completed';
  const canStart = meta.canProcess && ticket.status === 'pending';
  const canComplete = meta.canProcess && ticket.status === 'processing';

  async function submitComplete(): Promise<void> {
    if (resolution.trim().length === 0) return;
    await onComplete(resolution.trim());
    setCompleting(false);
    setResolution('');
  }

  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-center gap-3'>
        <Badge variant={STATUS_BADGE[ticket.status]}>
          {t(`tickets.status.${ticket.status}`)}
        </Badge>
        <Badge variant='secondary'>
          {t(`tickets.category.${ticket.category}`)}
        </Badge>
        <span className='font-mono text-sm text-muted-foreground'>
          {ticket.reference}
        </span>
      </div>

      {!meta.canProcess ? (
        <Alert>
          <InfoIcon />
          <AlertTitle>{t('tickets.detail.employeeTitle')}</AlertTitle>
          <AlertDescription>
            {t('tickets.detail.employeeHint')}
          </AlertDescription>
        </Alert>
      ) : null}

      <dl className='grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2'>
        <Field label={t('tickets.fields.submitter')}>
          {ticket.submitterName}
        </Field>
        <Field label={t('tickets.fields.handler')}>
          {ticket.handlerName ?? (
            <span className='text-muted-foreground'>
              {t('tickets.handlerUnassigned')}
            </span>
          )}
        </Field>
        <Field label={t('tickets.fields.createdAt')}>
          {formatWhen(ticket.createdAt)}
        </Field>
        <Field label={t('tickets.fields.completedAt')}>
          {formatWhen(ticket.completedAt) ?? (
            <span className='text-muted-foreground'>—</span>
          )}
        </Field>
      </dl>

      <Separator />

      <div className='space-y-2'>
        <h3 className='text-sm font-medium'>
          {t('tickets.fields.description')}
        </h3>
        <p className='text-sm whitespace-pre-wrap text-muted-foreground'>
          {ticket.description ?? t('tickets.noDescription')}
        </p>
      </div>

      <div className='space-y-2'>
        <h3 className='flex items-center gap-2 text-sm font-medium'>
          <WrenchIcon className='size-4' />
          {t('tickets.fields.resolution')}
        </h3>
        {ticket.resolution ? (
          <p className='rounded-lg border border-border bg-muted/40 p-3 text-sm whitespace-pre-wrap'>
            {ticket.resolution}
          </p>
        ) : (
          <p className='text-sm text-muted-foreground'>
            {t('tickets.detail.noResolution')}
          </p>
        )}
      </div>

      {completed ? (
        <Alert>
          <CheckCircle2Icon />
          <AlertTitle>{t('tickets.detail.completedTitle')}</AlertTitle>
          <AlertDescription>
            {t('tickets.detail.completedHint')}
          </AlertDescription>
        </Alert>
      ) : null}

      {canStart || canComplete ? (
        <>
          <Separator />
          <div className='flex flex-wrap items-center gap-3'>
            {canStart ? (
              <Button disabled={busy} onClick={() => void onStart()}>
                <PlayIcon data-icon='inline-start' />
                {t('tickets.detail.start')}
              </Button>
            ) : null}
            {canComplete ? (
              <Button
                disabled={busy}
                onClick={() => {
                  setResolution('');
                  setCompleting(true);
                }}
              >
                <CheckCircle2Icon data-icon='inline-start' />
                {t('tickets.detail.complete')}
              </Button>
            ) : null}
            <span className='flex items-center gap-1.5 text-xs text-muted-foreground'>
              <CalendarClockIcon className='size-3.5' />
              {t('tickets.detail.updatedAt', {
                value: formatWhen(ticket.updatedAt) ?? '',
              })}
            </span>
          </div>
        </>
      ) : null}

      <Dialog
        open={completing}
        onOpenChange={(open) => {
          if (!open) setCompleting(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('tickets.detail.completeTitle')}</DialogTitle>
            <DialogDescription>
              {t('tickets.detail.completeDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-2'>
            <label className='text-sm font-medium' htmlFor='ticket-resolution'>
              {t('tickets.fields.resolution')}
            </label>
            <Textarea
              id='ticket-resolution'
              value={resolution}
              onChange={(event) => setResolution(event.target.value)}
              placeholder={t('tickets.detail.resolutionPlaceholder')}
              rows={4}
              autoFocus
            />
            {resolution.trim().length === 0 ? (
              <p className='text-sm text-destructive'>
                {t('tickets.detail.resolutionRequired')}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setCompleting(false)}
              disabled={busy}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              onClick={() => void submitComplete()}
              disabled={busy || resolution.trim().length === 0}
            >
              {t('tickets.detail.completeConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface FieldProps {
  readonly label: string;
  readonly children: React.ReactNode;
}

function Field({ label, children }: FieldProps): ReactElement {
  return (
    <div>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className='mt-1 font-medium break-words'>{children}</dd>
    </div>
  );
}
