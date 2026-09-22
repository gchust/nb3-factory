import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import type { ServiceClient } from '../lib/api.js';
import {
  PRIORITY_OPTIONS,
  REGION_ASSIGNABLE,
  priorityLabel,
  regionLabel,
} from '../lib/format.js';
import type { ServiceCaller, ServiceMember, Ticket } from '../lib/types.js';

type ActionKind =
  | 'submit'
  | 'assign'
  | 'process'
  | 'submit-confirmation'
  | 'confirm'
  | 'reject'
  | 'cancel'
  | 'transfer';

/**
 * The dialog title for each action. The action identifiers are not all valid
 * translation keys — `submit-confirmation` is hyphenated while the locale
 * declares `submitConfirmation` — so they are mapped explicitly instead of
 * being interpolated into the key, which rendered the raw key on screen.
 */
const ACTION_TITLE_KEY: Record<ActionKind, string> = {
  submit: 'service.ticketActions.submit',
  assign: 'service.ticketActions.assign',
  process: 'service.ticketActions.process',
  'submit-confirmation': 'service.ticketActions.submitConfirmation',
  confirm: 'service.ticketActions.confirm',
  reject: 'service.ticketActions.reject',
  cancel: 'service.ticketActions.cancel',
  transfer: 'service.ticketActions.transfer',
};

interface ActionForm {
  assigneeId: string;
  note: string;
  reason: string;
  laborHours: string;
  resolution: string;
  region: string;
  priority: string;
}

const EMPTY: ActionForm = {
  assigneeId: '',
  note: '',
  reason: '',
  laborHours: '',
  resolution: '',
  region: '',
  priority: '',
};

/**
 * The ticket workflow controls. Every button is gated by a backend capability
 * and the ticket's current status; the server re-checks both, and this list is
 * only what the caller may reasonably do next.
 */
export function TicketActions({
  ticket,
  caller,
  client,
  members,
  onChanged,
}: {
  readonly ticket: Ticket;
  readonly caller: ServiceCaller;
  readonly client: ServiceClient;
  readonly members: readonly ServiceMember[];
  readonly onChanged: () => void | Promise<void>;
}): ReactElement {
  const { t } = useTranslation();
  const [action, setAction] = useState<ActionKind>();
  const [form, setForm] = useState<ActionForm>(EMPTY);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const has = (key: string) => caller.capabilities[key] === true;
  const status = ticket.status;
  // Only field engineers may be assigned a ticket; the server re-checks the
  // same eligibility before it writes the assignee.
  const assignableMembers = members.filter(
    (member) => member.assignable === true,
  );

  const available: {
    kind: ActionKind;
    label: string;
    variant?: 'default' | 'outline' | 'destructive';
  }[] = [];
  if (has('tickets.create') && status === 'draft')
    available.push({
      kind: 'submit',
      label: t('service.ticketActions.submit'),
    });
  if (
    has('tickets.assign') &&
    ['pending_dispatch', 'in_progress'].includes(status)
  )
    available.push({
      kind: 'assign',
      label: t('service.ticketActions.assign'),
    });
  if (has('tickets.process') && status === 'in_progress') {
    available.push({
      kind: 'process',
      label: t('service.ticketActions.process'),
    });
    available.push({
      kind: 'submit-confirmation',
      label: t('service.ticketActions.submitConfirmation'),
    });
  }
  if (has('tickets.confirm') && status === 'pending_confirmation') {
    available.push({
      kind: 'confirm',
      label: t('service.ticketActions.confirm'),
    });
    available.push({
      kind: 'reject',
      label: t('service.ticketActions.reject'),
      variant: 'outline',
    });
  }
  if (has('tickets.transfer') && !['closed', 'cancelled'].includes(status))
    available.push({
      kind: 'transfer',
      label: t('service.ticketActions.transfer'),
      variant: 'outline',
    });
  if (
    has('tickets.edit') &&
    ['draft', 'pending_dispatch', 'in_progress'].includes(status)
  )
    available.push({
      kind: 'cancel',
      label: t('service.ticketActions.cancel'),
      variant: 'destructive',
    });

  const open = (kind: ActionKind) => {
    setAction(kind);
    setForm(EMPTY);
    setError(undefined);
  };

  const close = () => {
    setAction(undefined);
    setForm(EMPTY);
    setError(undefined);
  };

  const submit = async () => {
    if (!action) return;
    if (action === 'transfer' && !form.reason.trim()) {
      setError(t('service.ticketActions.transferReasonRequired'));
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const payload: Record<string, unknown> = {};
      if (form.assigneeId) payload.assigneeId = form.assigneeId;
      if (form.note) payload.note = form.note;
      if (form.reason) payload.reason = form.reason;
      if (form.resolution) payload.resolution = form.resolution;
      if (form.region) payload.region = form.region;
      if (form.priority) payload.priority = form.priority;
      if (form.laborHours.trim()) payload.laborHours = Number(form.laborHours);
      await client.ticketAction(ticket.id, action, payload);
      close();
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  if (!available.length) return <></>;

  return (
    <div className='flex flex-wrap gap-2'>
      {available.map((item) => (
        <Button
          key={item.kind}
          onClick={() => open(item.kind)}
          size='sm'
          variant={item.variant ?? 'default'}
        >
          {item.label}
        </Button>
      ))}
      <Dialog
        open={action !== undefined}
        onOpenChange={(next) => !next && close()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action
                ? t(ACTION_TITLE_KEY[action])
                : t('service.ticketActions.title')}
            </DialogTitle>
            <DialogDescription>
              {t('service.ticketActions.help')}
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4'>
            {action === 'assign' || action === 'transfer' ? (
              <>
                <div className='space-y-2'>
                  <Label htmlFor='assignee'>
                    {t('service.tickets.assignee')}
                  </Label>
                  <Select
                    value={form.assigneeId || null}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        assigneeId: value ? String(value) : '',
                      }))
                    }
                  >
                    <SelectTrigger className='w-full' id='assignee'>
                      <SelectValue
                        placeholder={t('service.tickets.assigneePlaceholder')}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {assignableMembers.map((member) => (
                        <SelectItem key={member.userId} value={member.userId}>
                          {member.userName ?? member.userId} ·{' '}
                          {regionLabel(t, member.region)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {action === 'transfer' ? (
                  <>
                    <div className='space-y-2'>
                      <Label htmlFor='region'>
                        {t('service.tickets.region')}
                      </Label>
                      <Select
                        value={form.region || null}
                        onValueChange={(value) =>
                          setForm((current) => ({
                            ...current,
                            region: value ? String(value) : '',
                          }))
                        }
                      >
                        <SelectTrigger className='w-full' id='region'>
                          <SelectValue placeholder={t('service.common.keep')} />
                        </SelectTrigger>
                        <SelectContent>
                          {REGION_ASSIGNABLE.map((value) => (
                            <SelectItem key={value} value={value}>
                              {regionLabel(t, value)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='priority'>
                        {t('service.tickets.priority')}
                      </Label>
                      <Select
                        value={form.priority || null}
                        onValueChange={(value) =>
                          setForm((current) => ({
                            ...current,
                            priority: value ? String(value) : '',
                          }))
                        }
                      >
                        <SelectTrigger className='w-full' id='priority'>
                          <SelectValue placeholder={t('service.common.keep')} />
                        </SelectTrigger>
                        <SelectContent>
                          {PRIORITY_OPTIONS.map((value) => (
                            <SelectItem key={value} value={value}>
                              {priorityLabel(t, value)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : null}
              </>
            ) : null}
            {action === 'process' || action === 'submit-confirmation' ? (
              <>
                <div className='space-y-2'>
                  <Label htmlFor='note'>
                    {t('service.tickets.processNotes')}
                  </Label>
                  <Textarea
                    id='note'
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        note: event.target.value,
                      }))
                    }
                    value={form.note}
                  />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='laborHours'>
                    {t('service.tickets.laborHours')}
                  </Label>
                  <Input
                    id='laborHours'
                    min={0}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        laborHours: event.target.value,
                      }))
                    }
                    step='0.5'
                    type='number'
                    value={form.laborHours}
                  />
                </div>
              </>
            ) : null}
            {action === 'confirm' ? (
              <div className='space-y-2'>
                <Label htmlFor='resolution'>
                  {t('service.tickets.resolution')}
                </Label>
                <Textarea
                  id='resolution'
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      resolution: event.target.value,
                    }))
                  }
                  value={form.resolution}
                />
              </div>
            ) : null}
            {action === 'reject' ||
            action === 'cancel' ||
            action === 'transfer' ? (
              <div className='space-y-2'>
                <Label htmlFor='reason'>
                  {action === 'transfer'
                    ? t('service.ticketActions.transferReason')
                    : t('service.tickets.reason')}
                </Label>
                <Textarea
                  id='reason'
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      reason: event.target.value,
                    }))
                  }
                  value={form.reason}
                />
              </div>
            ) : null}
            {action === 'submit' ? (
              <div className='space-y-2'>
                <Label htmlFor='submitNote'>{t('service.tickets.note')}</Label>
                <Textarea
                  id='submitNote'
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      note: event.target.value,
                    }))
                  }
                  value={form.note}
                />
              </div>
            ) : null}
            {error ? <p className='text-sm text-destructive'>{error}</p> : null}
          </div>
          <DialogFooter>
            <Button disabled={busy} onClick={close} variant='outline'>
              {t('service.common.cancel')}
            </Button>
            <Button disabled={busy} onClick={() => void submit()}>
              {t('service.common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
