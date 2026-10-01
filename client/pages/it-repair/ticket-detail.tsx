import { useTranslation } from '@nocobase/i18n/client';
import { format } from 'date-fns';
import { PlayIcon, CheckCircle2Icon } from 'lucide-react';
import { type FormEvent, type ReactElement, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';

import type { RepairTicket, TicketStatus } from './api.js';

const STATUS_BADGE: Record<
  TicketStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending: 'outline',
  processing: 'secondary',
  completed: 'default',
};

export interface TicketDetailSheetProps {
  readonly ticket: RepairTicket | null;
  readonly busy: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onStart: (ticket: RepairTicket) => void;
  readonly onComplete: (ticket: RepairTicket, resolution: string) => void;
}

function DetailRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}): ReactElement {
  return (
    <div className='flex flex-col gap-1'>
      <span className='text-xs font-medium text-muted-foreground'>{label}</span>
      <span className='text-sm'>{children}</span>
    </div>
  );
}

function timestamp(value: string | null): string {
  return value ? format(new Date(value), 'PPp') : '—';
}

/** The detail side panel, including the handling actions a handler may take. */
export function TicketDetailSheet({
  ticket,
  busy,
  onOpenChange,
  onStart,
  onComplete,
}: TicketDetailSheetProps): ReactElement {
  const { t } = useTranslation();
  const [resolution, setResolution] = useState('');

  const complete = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!ticket) return;
    const note = resolution.trim();
    if (!note) return;
    onComplete(ticket, note);
  };

  return (
    <Sheet
      open={ticket !== null}
      onOpenChange={(open) => {
        if (!open) {
          setResolution('');
          onOpenChange(false);
        }
      }}
    >
      <SheetContent className='sm:max-w-lg'>
        {ticket ? (
          <>
            <SheetHeader>
              <SheetTitle className='flex items-center gap-3 pr-8'>
                <span className='min-w-0 truncate'>{ticket.title}</span>
                <Badge
                  variant={STATUS_BADGE[ticket.status]}
                  className='shrink-0'
                >
                  {t(`itRepair.status.${ticket.status}`)}
                </Badge>
              </SheetTitle>
              <SheetDescription>
                {t('itRepair.detail.subtitle', {
                  category: t(`itRepair.category.${ticket.category}`),
                })}
              </SheetDescription>
            </SheetHeader>
            <div className='flex flex-1 flex-col gap-6 overflow-y-auto px-4'>
              <div className='grid grid-cols-2 gap-4'>
                <DetailRow label={t('itRepair.detail.submittedBy')}>
                  {ticket.submittedByName}
                </DetailRow>
                <DetailRow label={t('itRepair.detail.handler')}>
                  {ticket.handlerName ?? '—'}
                </DetailRow>
                <DetailRow label={t('itRepair.detail.createdAt')}>
                  {timestamp(ticket.createdAt)}
                </DetailRow>
                <DetailRow label={t('itRepair.detail.startedAt')}>
                  {timestamp(ticket.processingAt)}
                </DetailRow>
                <DetailRow label={t('itRepair.detail.completedAt')}>
                  {timestamp(ticket.completedAt)}
                </DetailRow>
              </div>

              <Separator />

              <DetailRow label={t('itRepair.detail.issue')}>
                <span className='whitespace-pre-wrap'>
                  {ticket.description ?? t('itRepair.detail.noDescription')}
                </span>
              </DetailRow>

              {ticket.resolution ? (
                <DetailRow label={t('itRepair.detail.resolution')}>
                  <span className='whitespace-pre-wrap'>
                    {ticket.resolution}
                  </span>
                </DetailRow>
              ) : null}

              {ticket.status === 'completed' ? (
                <p className='text-sm text-muted-foreground'>
                  {t('itRepair.detail.locked')}
                </p>
              ) : null}

              {ticket.canStart ? (
                <Button
                  type='button'
                  disabled={busy}
                  onClick={() => onStart(ticket)}
                >
                  <PlayIcon />
                  {busy ? t('itRepair.starting') : t('itRepair.start')}
                </Button>
              ) : null}

              {ticket.canComplete ? (
                <form
                  onSubmit={complete}
                  className='flex flex-col gap-3 rounded-lg border border-border p-4'
                >
                  <label
                    htmlFor='ticket-resolution'
                    className='text-sm font-medium'
                  >
                    {t('itRepair.detail.resolutionLabel')}
                  </label>
                  <Textarea
                    id='ticket-resolution'
                    rows={4}
                    maxLength={5000}
                    value={resolution}
                    onChange={(event) => setResolution(event.target.value)}
                    placeholder={t('itRepair.detail.resolutionPlaceholder')}
                  />
                  <Button
                    type='submit'
                    disabled={busy || resolution.trim().length === 0}
                  >
                    <CheckCircle2Icon />
                    {busy ? t('itRepair.completing') : t('itRepair.complete')}
                  </Button>
                </form>
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
