import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { SessionExpiredAlert } from '#components/session-expired-alert';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '#components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Spinner } from '#components/ui/spinner';
import { Textarea } from '#components/ui/textarea';

import type { ItUser, Ticket } from '../types.js';

export type TicketActionKind =
  'assign' | 'process' | 'resolve' | 'return' | 'close' | 'comment';

/** Where the action posts, and which field it collects. */
const ACTION_ENDPOINTS: Record<
  TicketActionKind,
  {
    readonly endpoint: string;
    readonly field:
      'assigneeId' | 'content' | 'resolution' | 'reason' | 'comment';
    readonly required: boolean;
  }
> = {
  assign: { endpoint: 'assign', field: 'assigneeId', required: true },
  process: { endpoint: 'process', field: 'content', required: true },
  resolve: { endpoint: 'resolve', field: 'resolution', required: true },
  return: { endpoint: 'return', field: 'reason', required: true },
  close: { endpoint: 'close', field: 'comment', required: false },
  comment: { endpoint: 'comment', field: 'content', required: true },
};

export interface TicketActionDialogProps {
  readonly kind: TicketActionKind | null;
  readonly ticket: Ticket;
  readonly engineers: readonly ItUser[];
  readonly onOpenChange: (open: boolean) => void;
  /** Called after the endpoint succeeds, before the dialog closes. */
  readonly onDone: () => void;
}

/** One dialog for every ticket action: the kind decides the title, the field and the endpoint. */
export function TicketActionDialog({
  kind,
  ticket,
  engineers,
  onOpenChange,
  onDone,
}: TicketActionDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  const config = kind ? ACTION_ENDPOINTS[kind] : null;
  const submit = async (): Promise<void> => {
    if (!kind || !config) return;
    const trimmed = value.trim();
    if (config.required && !trimmed) {
      setError(t('tickets.form.actionRequired'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.request<{ data: Ticket }>({
        path: `itTickets/${ticket.id}/${config.endpoint}`,
        method: 'POST',
        json: { [config.field]: trimmed || undefined },
      });
    } catch (caught: unknown) {
      const apiError = caught instanceof ApiClientError ? caught : undefined;
      if (apiError?.status === 401) {
        setSessionExpired(true);
      } else if (
        apiError?.status === 400 &&
        apiError.reason === 'TICKET_INVALID_ASSIGNEE'
      ) {
        setError(t('tickets.error.invalidAssignee'));
      } else if (apiError?.status === 409) {
        setError(t('tickets.error.invalidState'));
      } else if (apiError?.status === 403) {
        setError(t('tickets.error.forbidden'));
      } else {
        setError(t('tickets.error.requestFailed'));
      }
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    toaster.show({
      type: 'success',
      title: t(`tickets.actions.${kind}.success`, { id: ticket.id }),
    });
    onDone();
    onOpenChange(false);
  };

  const engineerItems = engineers.map((user) => ({
    value: user.userId,
    label: user.name,
  }));

  return (
    <Dialog
      open={kind !== null}
      onOpenChange={(open) => {
        if (!submitting) onOpenChange(open);
      }}
    >
      <DialogContent className='sm:max-w-md' showCloseButton={!submitting}>
        {kind && config ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {t(`tickets.actions.${kind}.title`, { id: ticket.id })}
              </DialogTitle>
              <DialogDescription>
                {t(`tickets.actions.${kind}.description`)}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup>
              {sessionExpired ? (
                <SessionExpiredAlert />
              ) : error ? (
                <Alert variant='destructive'>
                  <AlertCircleIcon />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              {config.field === 'assigneeId' ? (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor='ticket-action-value'>
                    {t('tickets.fields.assignee')}
                  </FieldLabel>
                  <Select
                    items={engineerItems}
                    value={value || null}
                    onValueChange={(next) => {
                      if (next) setValue(next);
                    }}
                  >
                    <SelectTrigger
                      id='ticket-action-value'
                      className='w-full'
                      aria-invalid={Boolean(error)}
                    >
                      <SelectValue
                        placeholder={t('tickets.actions.assign.placeholder')}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {engineerItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {engineerItems.length === 0 ? (
                    <p className='text-sm text-muted-foreground'>
                      {t('tickets.actions.assign.noEngineers')}
                    </p>
                  ) : null}
                </Field>
              ) : (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor='ticket-action-value'>
                    {t(`tickets.actions.${kind}.label`)}
                  </FieldLabel>
                  <Textarea
                    id='ticket-action-value'
                    rows={4}
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    aria-invalid={Boolean(error)}
                  />
                </Field>
              )}
            </FieldGroup>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                disabled={submitting}
                onClick={() => onOpenChange(false)}
              >
                {t('actions.cancel')}
              </Button>
              <Button
                type='button'
                disabled={submitting}
                onClick={() => void submit()}
              >
                {submitting ? <Spinner data-icon='inline-start' /> : null}
                {submitting
                  ? t('actions.saving')
                  : t(`tickets.actions.${kind}.confirm`)}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
