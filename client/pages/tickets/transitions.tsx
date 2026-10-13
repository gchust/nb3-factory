import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { useMemo, useRef, useState, type ReactElement } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { RouteDialog } from '#components/route-dialog';
import { SessionExpiredAlert } from '#components/session-expired-alert';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  Field,
  FieldDescription,
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
import { useRouteOverlay } from '#components/use-route-overlay';
import { fireTicket, useEngineers, type TicketView } from '#hooks/service-desk';
import { useTransitionText } from '#hooks/use-transition-text';

import { newRequestId, useApiErrorMessage } from '#hooks/api-error-message';

const FORM_ID = 'ticket-transition-form';
const MAX_TEXT = 20_000;

/** The transitions that ask for something before they fire, and the input each contributes. */
export type TicketTransitionName =
  'assign' | 'reassign' | 'resolve' | 'return' | 'cancel';

interface TransitionSpec {
  readonly kind: 'engineer' | 'text';
  readonly field: 'assigneeId' | 'solution' | 'returnReason';
  readonly max: number;
}

const SPECS: Record<TicketTransitionName, TransitionSpec> = {
  assign: { kind: 'engineer', field: 'assigneeId', max: 64 },
  reassign: { kind: 'engineer', field: 'assigneeId', max: 64 },
  resolve: { kind: 'text', field: 'solution', max: MAX_TEXT },
  return: { kind: 'text', field: 'returnReason', max: MAX_TEXT },
  cancel: { kind: 'text', field: 'returnReason', max: MAX_TEXT },
};

/**
 * A transition that needs input, as a dialog over the record. The server owns the transition table, so this only
 * collects the input; a guard that refuses the transition answers with its reason and the dialog stays open.
 */
export function TransitionDialog({
  transition,
  ticketId,
  version,
  reload,
}: {
  readonly transition: TicketTransitionName;
  readonly ticketId: number;
  readonly version: number | null;
  readonly reload: () => void;
}): ReactElement {
  const text = useTransitionText();
  // The state disables the buttons; the ref is what beforeClose reads, because the close that follows a successful
  // fire runs before the new state has rendered (guideline T3.5).
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  return (
    <RouteDialog
      title={text(transition).title}
      description={text(transition).description}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={<TransitionFooter busy={submitting} />}
    >
      <TransitionForm
        transition={transition}
        ticketId={ticketId}
        version={version}
        reload={reload}
        onSubmittingChange={(value) => {
          submittingRef.current = value;
          setSubmitting(value);
        }}
      />
    </RouteDialog>
  );
}

// useRouteOverlay() works only inside RouteDialog, so the footer has its own wrapper.
function TransitionFooter({ busy }: { readonly busy: boolean }): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <>
      <Button
        type='button'
        variant='outline'
        disabled={busy}
        onClick={() => void close()}
      >
        {t('actions.cancel')}
      </Button>
      {/* Outside the <form>, linked through the form attribute; disabled while the request runs. */}
      <Button type='submit' form={FORM_ID} disabled={busy}>
        {busy ? <Spinner data-icon='inline-start' /> : null}
        {busy ? t('serviceDesk.transition.working') : t('actions.confirm')}
      </Button>
    </>
  );
}

function TransitionForm({
  transition,
  ticketId,
  version,
  reload,
  onSubmittingChange,
}: {
  readonly transition: TicketTransitionName;
  readonly ticketId: number;
  readonly version: number | null;
  readonly reload: () => void;
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const describeError = useApiErrorMessage();
  const { close } = useRouteOverlay();
  const spec = SPECS[transition];
  // The engineer list is only read for the two transitions that assign somebody.
  const engineers = useEngineers(spec.kind === 'engineer');
  // One key for this dialog, so a submission retried after a lost response fires once (the server deduplicates it).
  const [requestId] = useState(() => newRequestId());
  const schema = useMemo(
    () =>
      z.object({
        value: z
          .string()
          .trim()
          .min(1, t('serviceDesk.transition.required'))
          .max(spec.max),
      }),
    [t, spec.max],
  );
  const form = useForm<{ value: string }>({
    resolver: zodResolver(schema),
    defaultValues: { value: '' },
  });
  const rootError = form.formState.errors.root;
  const engineerItems = (engineers.data ?? []).map((engineer) => ({
    value: engineer.id,
    label: engineer.name,
  }));
  const noEngineers =
    spec.kind === 'engineer' &&
    engineers.data !== undefined &&
    engineers.data.length === 0;

  const onSubmit = form.handleSubmit(async (values) => {
    let view: TicketView;
    onSubmittingChange(true);
    try {
      view = await fireTicket(api, ticketId, {
        transition,
        input: { [spec.field]: values.value },
        expectVersion: version ?? undefined,
        requestId,
      });
    } catch (error) {
      const sessionExpired =
        error instanceof ApiClientError && error.status === 401;
      form.setError('root', {
        type: sessionExpired ? 'sessionExpired' : 'api',
        message: describeError(error),
      });
      return;
    } finally {
      onSubmittingChange(false);
    }
    toaster.show({
      type: 'success',
      title: t('serviceDesk.transition.done', { id: view.record.id }),
    });
    reload();
    void close();
  });

  return (
    <form id={FORM_ID} noValidate onSubmit={(event) => void onSubmit(event)}>
      <FieldGroup>
        {rootError?.type === 'sessionExpired' ? (
          <SessionExpiredAlert />
        ) : rootError ? (
          <Alert variant='destructive'>
            <AlertCircleIcon />
            <AlertDescription>{rootError.message}</AlertDescription>
          </Alert>
        ) : null}

        {spec.kind === 'engineer' ? (
          <Controller
            control={form.control}
            name='value'
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${FORM_ID}-engineer`}>
                  {t('serviceDesk.transition.engineer')}
                  <span aria-hidden='true' className='text-destructive'>
                    *
                  </span>
                </FieldLabel>
                <Select
                  items={engineerItems}
                  value={field.value === '' ? null : field.value}
                  onValueChange={(next: string | null) => {
                    if (next) field.onChange(next);
                  }}
                >
                  <SelectTrigger
                    ref={field.ref}
                    id={`${FORM_ID}-engineer`}
                    onBlur={field.onBlur}
                    aria-invalid={fieldState.invalid}
                    disabled={engineers.isLoading || noEngineers}
                    className='w-full'
                  >
                    <SelectValue
                      placeholder={t(
                        'serviceDesk.transition.engineerPlaceholder',
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {engineerItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {noEngineers ? (
                  <FieldDescription>
                    {t('serviceDesk.transition.noEngineers')}
                  </FieldDescription>
                ) : null}
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        ) : (
          <Controller
            control={form.control}
            name='value'
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${FORM_ID}-text`}>
                  {transition === 'resolve'
                    ? t('serviceDesk.transition.solution')
                    : t('serviceDesk.transition.reason')}
                  <span aria-hidden='true' className='text-destructive'>
                    *
                  </span>
                </FieldLabel>
                <Textarea
                  {...field}
                  id={`${FORM_ID}-text`}
                  rows={5}
                  aria-required='true'
                  aria-invalid={fieldState.invalid}
                  placeholder={
                    transition === 'resolve'
                      ? t('serviceDesk.transition.solutionPlaceholder')
                      : t('serviceDesk.transition.reasonPlaceholder')
                  }
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        )}
      </FieldGroup>
    </form>
  );
}

/**
 * A transition that needs nothing from the user, fired from the record page's header when it is clicked. It reports
 * its own failure with a toast rather than a dialog, because there is no form to put the reason in.
 */
export function DirectTransitionButton({
  transition,
  ticketId,
  version,
  variant = 'outline',
  onDone,
}: {
  readonly transition: string;
  readonly ticketId: number;
  readonly version: number | null;
  readonly variant?: 'default' | 'outline';
  readonly onDone: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const text = useTransitionText();
  const api = useApiClient();
  const toaster = useToaster();
  const describeError = useApiErrorMessage();
  const [pending, setPending] = useState(false);

  async function fire(): Promise<void> {
    setPending(true);
    try {
      const view = await fireTicket(api, ticketId, {
        transition,
        expectVersion: version ?? undefined,
        requestId: newRequestId(),
      });
      toaster.show({
        type: 'success',
        title: t('serviceDesk.transition.done', { id: view.record.id }),
      });
      onDone();
    } catch (error) {
      toaster.show({ type: 'error', title: describeError(error) });
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type='button'
      variant={variant}
      disabled={pending}
      onClick={() => void fire()}
    >
      {pending ? <Spinner data-icon='inline-start' /> : null}
      {text(transition).label}
    </Button>
  );
}
