import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { useLocation, useOutletContext } from 'react-router';

import { RouteDialog } from '#components/route-dialog';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Label } from '#components/ui/label';
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
import { useRouteOverlay } from '#components/use-route-overlay';

import { fireTicket, listEngineers } from './api.js';
import type { Engineer, TicketDetailOutletContext } from './types.js';

const FORM_ID = 'it-ticket-transition-form';

const TITLES: Record<string, string> = {
  assign: 'tickets.dialog.assign.title',
  reassign: 'tickets.dialog.reassign.title',
  progress: 'tickets.dialog.progress.title',
  resolve: 'tickets.dialog.resolve.title',
  return: 'tickets.dialog.return.title',
};

const DESCRIPTIONS: Record<string, string> = {
  assign: 'tickets.dialog.assign.description',
  reassign: 'tickets.dialog.reassign.description',
  progress: 'tickets.dialog.progress.description',
  resolve: 'tickets.dialog.resolve.description',
  return: 'tickets.dialog.return.description',
};

/** The transition the current overlay route names, taken from its last path segment. */
function useTransition(): string {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);
  return segments.at(-1) ?? '';
}

export default function TicketTransitionPage(): ReactElement {
  const { t } = useTranslation();
  const transition = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const title = TITLES[transition] ?? transition;

  return (
    <RouteDialog
      title={t(title)}
      description={t(DESCRIPTIONS[transition] ?? 'tickets.dialog.description')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={<TransitionFooter submitting={submitting} />}
    >
      <TransitionBody
        transition={transition}
        onSubmittingChange={(value) => {
          submittingRef.current = value;
          setSubmitting(value);
        }}
      />
    </RouteDialog>
  );
}

function TransitionBody({
  transition,
  onSubmittingChange,
}: {
  readonly transition: string;
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const { close } = useRouteOverlay();
  const { ticket, reload } = useOutletContext<TicketDetailOutletContext>();

  const [engineers, setEngineers] = useState<readonly Engineer[]>([]);
  const [assigneeId, setAssigneeId] = useState(ticket.assigneeId ?? '');
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();

  const isAssign = transition === 'assign' || transition === 'reassign';

  useEffect(() => {
    if (!isAssign) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await listEngineers(api);
        if (!cancelled) setEngineers(result);
      } catch {
        // The select stays empty; submitting then reports the failure.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, isAssign]);

  const engineerItems = engineers.map((engineer) => ({
    value: engineer.id,
    label: engineer.name ?? engineer.username ?? engineer.id,
  }));

  const submit = async (): Promise<void> => {
    const input = isAssign
      ? { assigneeId }
      : transition === 'progress'
        ? { handlingNote: text.trim() }
        : transition === 'resolve'
          ? { solution: text.trim() }
          : { lastReturnReason: text.trim() };
    if (isAssign ? !assigneeId : !text.trim()) {
      setError(t('tickets.dialog.required'));
      return;
    }
    onSubmittingChange(true);
    setError(undefined);
    try {
      await fireTicket(api, ticket.id, transition, input);
      toaster.show({ type: 'success', title: t('tickets.action.success') });
      reload();
      void close();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : t('tickets.action.failed'),
      );
    } finally {
      onSubmittingChange(false);
    }
  };

  return (
    <form
      id={FORM_ID}
      noValidate
      className='flex flex-col gap-4'
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {isAssign ? (
        <div className='flex flex-col gap-2'>
          <Label>{t('tickets.field.assignee')}</Label>
          <Select
            items={engineerItems}
            value={assigneeId}
            onValueChange={(value) => setAssigneeId(String(value))}
          >
            <SelectTrigger aria-label={t('tickets.field.assignee')}>
              <SelectValue placeholder={t('tickets.field.chooseEngineer')} />
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
        </div>
      ) : (
        <div className='flex flex-col gap-2'>
          <Label htmlFor={`${FORM_ID}-text`}>
            {transition === 'progress'
              ? t('tickets.field.handlingNote')
              : transition === 'resolve'
                ? t('tickets.field.solution')
                : t('tickets.field.lastReturnReason')}
          </Label>
          <Textarea
            id={`${FORM_ID}-text`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={5}
            required
          />
        </div>
      )}
    </form>
  );
}

function TransitionFooter({
  submitting,
}: {
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <>
      <Button
        type='button'
        variant='outline'
        disabled={submitting}
        onClick={() => void close()}
      >
        {t('actions.cancel')}
      </Button>
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('actions.saving') : t('actions.confirm')}
      </Button>
    </>
  );
}
