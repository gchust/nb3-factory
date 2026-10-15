import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useEffect, useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#components/ui/alert-dialog';
import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Spinner } from '#components/ui/spinner';
import { Textarea } from '#components/ui/textarea';

import {
  assignTicket,
  commentTicket,
  confirmTicket,
  fetchEngineers,
  resolveTicket,
  returnTicket,
} from '../api.js';
import { serviceDeskRequirement } from '../permissions.js';
import type { Engineer, TicketDetail } from '../types.js';

export interface TicketActionsProps {
  readonly detail: TicketDetail;
  /** Replaces the drawer's data with the detail the endpoint returned. */
  readonly onChanged: (detail: TicketDetail) => void;
}

type ActionKind = 'assign' | 'resolve' | 'confirm' | 'return' | 'comment';

function messageFor(error: unknown, t: (key: string) => string): string {
  const status = error instanceof ApiClientError ? error.status : 0;
  if (status === 403) return t('tickets.actions.forbidden');
  if (status === 409) return t('tickets.actions.conflict');
  return t('tickets.actions.requestFailed');
}

/** The drawer's footer actions: the one next step the ticket's status allows, plus a comment. */
export function TicketActions({
  detail,
  onChanged,
}: TicketActionsProps): ReactElement {
  const { t } = useTranslation();
  const [open, setOpen] = useState<ActionKind>();
  const status = detail.ticket.status;
  const canAssign = useCan(serviceDeskRequirement('assign')).can;
  const canResolve = useCan(serviceDeskRequirement('resolve')).can;
  const canConfirm = useCan(serviceDeskRequirement('confirm')).can;
  const canReturn = useCan(serviceDeskRequirement('return')).can;
  const canComment = useCan(serviceDeskRequirement('comment')).can;

  const showAssign =
    canAssign && (status === 'pending' || status === 'processing');
  const showResolve = canResolve && status === 'processing';
  const showConfirm = canConfirm && status === 'resolved';
  const showReturn = canReturn && status === 'resolved';

  const close = (next?: TicketDetail): void => {
    setOpen(undefined);
    if (next) onChanged(next);
  };

  if (
    !showAssign &&
    !showResolve &&
    !showConfirm &&
    !showReturn &&
    !canComment
  ) {
    return <></>;
  }

  return (
    <>
      {showReturn ? (
        <Button variant='outline' onClick={() => setOpen('return')}>
          {t('tickets.actions.return')}
        </Button>
      ) : null}
      {canComment ? (
        <Button variant='outline' onClick={() => setOpen('comment')}>
          {t('tickets.actions.comment')}
        </Button>
      ) : null}
      {showAssign ? (
        <Button onClick={() => setOpen('assign')}>
          {t('tickets.actions.assign')}
        </Button>
      ) : null}
      {showResolve ? (
        <Button onClick={() => setOpen('resolve')}>
          {t('tickets.actions.resolve')}
        </Button>
      ) : null}
      {showConfirm ? (
        <Button onClick={() => setOpen('confirm')}>
          {t('tickets.actions.confirm')}
        </Button>
      ) : null}

      <AssignDialog
        ticketId={detail.ticket.id}
        open={open === 'assign'}
        onOpenChange={(next) => setOpen(next ? 'assign' : undefined)}
        onDone={close}
      />
      <ResolveDialog
        ticketId={detail.ticket.id}
        open={open === 'resolve'}
        onOpenChange={(next) => setOpen(next ? 'resolve' : undefined)}
        onDone={close}
      />
      <ConfirmDialog
        ticketId={detail.ticket.id}
        open={open === 'confirm'}
        onOpenChange={(next) => setOpen(next ? 'confirm' : undefined)}
        onDone={close}
      />
      <ReturnDialog
        ticketId={detail.ticket.id}
        open={open === 'return'}
        onOpenChange={(next) => setOpen(next ? 'return' : undefined)}
        onDone={close}
      />
      <CommentDialog
        ticketId={detail.ticket.id}
        open={open === 'comment'}
        onOpenChange={(next) => setOpen(next ? 'comment' : undefined)}
        onDone={close}
      />
    </>
  );
}

function AssignDialog({
  ticketId,
  open,
  onOpenChange,
  onDone,
}: {
  readonly ticketId: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onDone: (detail: TicketDetail) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [engineers, setEngineers] = useState<readonly Engineer[]>([]);
  const [assigneeId, setAssigneeId] = useState('');
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    let active = true;
    fetchEngineers(api).then(
      (list) => {
        if (active) setEngineers(list);
      },
      () => {
        if (active) setError(t('tickets.actions.engineersFailed'));
      },
    );
    return () => {
      active = false;
    };
  }, [open, api, t]);

  const submit = async (): Promise<void> => {
    if (!assigneeId) {
      setError(t('tickets.actions.assigneeRequired'));
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const updated = await assignTicket(api, ticketId, {
        assigneeId,
        note: note.trim() || undefined,
      });
      toaster.show({ type: 'success', title: t('tickets.actions.assigned') });
      onDone(updated);
    } catch (caught) {
      setError(messageFor(caught, t));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && pending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('tickets.actions.assignTitle')}</DialogTitle>
          <DialogDescription>
            {t('tickets.actions.assignDescription')}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>{t('tickets.fields.assignee')}</FieldLabel>
            <Select
              value={assigneeId}
              onValueChange={(value) => {
                if (value) setAssigneeId(value);
              }}
            >
              <SelectTrigger className='w-full'>
                <SelectValue
                  placeholder={t('tickets.actions.assigneePlaceholder')}
                />
              </SelectTrigger>
              <SelectContent>
                {engineers.map((engineer) => (
                  <SelectItem key={engineer.id} value={engineer.id}>
                    {engineer.name || engineer.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>{t('tickets.actions.note')}</FieldLabel>
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
            />
          </Field>
          {error ? <FieldError>{error}</FieldError> : null}
        </FieldGroup>
        <DialogFooter>
          <Button
            variant='outline'
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {t('actions.cancel')}
          </Button>
          <Button disabled={pending} onClick={() => void submit()}>
            {pending ? <Spinner data-icon='inline-start' /> : null}
            {t('tickets.actions.assign')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResolveDialog({
  ticketId,
  open,
  onOpenChange,
  onDone,
}: {
  readonly ticketId: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onDone: (detail: TicketDetail) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [resolution, setResolution] = useState('');
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (): Promise<void> => {
    if (!resolution.trim()) {
      setError(t('tickets.actions.resolutionRequired'));
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const updated = await resolveTicket(api, ticketId, {
        resolution: resolution.trim(),
        note: note.trim() || undefined,
      });
      toaster.show({ type: 'success', title: t('tickets.actions.resolved') });
      onDone(updated);
    } catch (caught) {
      setError(messageFor(caught, t));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && pending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('tickets.actions.resolveTitle')}</DialogTitle>
          <DialogDescription>
            {t('tickets.actions.resolveDescription')}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>{t('tickets.fields.resolution')}</FieldLabel>
            <Textarea
              value={resolution}
              onChange={(event) => setResolution(event.target.value)}
              rows={4}
            />
          </Field>
          <Field>
            <FieldLabel>{t('tickets.actions.note')}</FieldLabel>
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
            />
          </Field>
          {error ? <FieldError>{error}</FieldError> : null}
        </FieldGroup>
        <DialogFooter>
          <Button
            variant='outline'
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {t('actions.cancel')}
          </Button>
          <Button disabled={pending} onClick={() => void submit()}>
            {pending ? <Spinner data-icon='inline-start' /> : null}
            {t('tickets.actions.resolve')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmDialog({
  ticketId,
  open,
  onOpenChange,
  onDone,
}: {
  readonly ticketId: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onDone: (detail: TicketDetail) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (): Promise<void> => {
    setPending(true);
    setError(undefined);
    try {
      const updated = await confirmTicket(api, ticketId);
      toaster.show({ type: 'success', title: t('tickets.actions.confirmed') });
      onDone(updated);
    } catch (caught) {
      setError(messageFor(caught, t));
      setPending(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && pending) return;
        if (!next) setError(undefined);
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('tickets.actions.confirmTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('tickets.actions.confirmDescription')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role='alert' className='text-sm text-destructive'>
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {t('actions.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={() => void submit()}>
            {pending ? <Spinner data-icon='inline-start' /> : null}
            {t('tickets.actions.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ReturnDialog({
  ticketId,
  open,
  onOpenChange,
  onDone,
}: {
  readonly ticketId: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onDone: (detail: TicketDetail) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (): Promise<void> => {
    if (!reason.trim()) {
      setError(t('tickets.actions.reasonRequired'));
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const updated = await returnTicket(api, ticketId, {
        reason: reason.trim(),
      });
      toaster.show({ type: 'success', title: t('tickets.actions.returned') });
      onDone(updated);
    } catch (caught) {
      setError(messageFor(caught, t));
      setPending(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && pending) return;
        if (!next) setError(undefined);
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('tickets.actions.returnTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('tickets.actions.returnDescription')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>{t('tickets.actions.reason')}</FieldLabel>
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
            />
          </Field>
          {error ? <FieldError>{error}</FieldError> : null}
        </FieldGroup>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {t('actions.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            variant='destructive'
            disabled={pending}
            onClick={() => void submit()}
          >
            {pending ? <Spinner data-icon='inline-start' /> : null}
            {t('tickets.actions.return')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function CommentDialog({
  ticketId,
  open,
  onOpenChange,
  onDone,
}: {
  readonly ticketId: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onDone: (detail: TicketDetail) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [content, setContent] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (): Promise<void> => {
    if (!content.trim()) {
      setError(t('tickets.actions.commentRequired'));
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const updated = await commentTicket(api, ticketId, content.trim());
      onDone(updated);
    } catch (caught) {
      setError(messageFor(caught, t));
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && pending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('tickets.actions.commentTitle')}</DialogTitle>
          <DialogDescription>
            {t('tickets.actions.commentDescription')}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>{t('tickets.actions.comment')}</FieldLabel>
            <Textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={4}
            />
          </Field>
          {error ? <FieldError>{error}</FieldError> : null}
        </FieldGroup>
        <DialogFooter>
          <Button
            variant='outline'
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {t('actions.cancel')}
          </Button>
          <Button disabled={pending} onClick={() => void submit()}>
            {pending ? <Spinner data-icon='inline-start' /> : null}
            {t('tickets.actions.comment')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
