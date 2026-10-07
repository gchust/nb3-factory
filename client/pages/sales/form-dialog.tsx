import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import type { To } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { SessionExpiredAlert } from '@/components/session-expired-alert';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

/** What a form rendered inside a sales dialog is given. */
export interface SalesFormDialogFormProps<TRecord> {
  /** The `<form>` id. The dialog's submit button lives outside the form and sets `form={formId}`. */
  readonly formId: string;
  /** Receives `true` when submission starts and `false` when it ends; on success, `false` comes before `onSubmitted`. */
  readonly onSubmittingChange: (submitting: boolean) => void;
  /** Called after a successful save with the record the endpoint returned; the dialog then closes. */
  readonly onSubmitted: (record: TRecord) => void;
}

export interface SalesFormDialogProps<TRecord> {
  readonly title: string;
  readonly description?: string;
  readonly className?: string;
  readonly closeTo?: To;
  /** The label of the submit button: "Create" while creating, "Save" while editing. */
  readonly submitLabel: string;
  /** Renders the fields of the form; called inside the dialog, so it may use `useRouteOverlay()`. */
  readonly renderForm: (
    props: SalesFormDialogFormProps<TRecord>,
  ) => ReactElement;
  /** Called after a successful save, before the dialog closes. */
  readonly onSaved: (record: TRecord) => void;
}

/**
 * A dialog that owns one create-or-edit form.
 *
 * It puts the buttons in the dialog's footer and the fields in its body, keeps both disabled while the save is in
 * flight, and refuses to close until the save finishes — the × button, Esc, clicking the backdrop and a programmatic
 * close all pass through `beforeClose`. The sales forms differ only in their fields and their labels, so the frame
 * lives here once.
 */
export function SalesFormDialog<TRecord>({
  title,
  description,
  className,
  closeTo,
  submitLabel,
  renderForm,
  onSaved,
}: SalesFormDialogProps<TRecord>): ReactElement {
  const formId = useId();
  const [submitting, setSubmitting] = useState(false);
  // The ref is what beforeClose reads: when close() runs right after a successful save, the state value has not
  // rendered yet.
  const submittingRef = useRef(false);
  const handleSubmittingChange = useCallback((value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  }, []);

  return (
    <RouteDialog
      title={title}
      description={description}
      className={className}
      closeTo={closeTo}
      beforeClose={() => !submittingRef.current}
      footer={
        <SalesFormFooter
          formId={formId}
          submitLabel={submitLabel}
          submitting={submitting}
        />
      }
    >
      <SalesFormBody
        formId={formId}
        renderForm={renderForm}
        onSubmittingChange={handleSubmittingChange}
        onSaved={onSaved}
      />
    </RouteDialog>
  );
}

export interface SalesEditDialogProps<TRecord> {
  readonly title: string;
  readonly description?: string;
  readonly className?: string;
  readonly closeTo?: To;
  /** The path of the record below `/api`: `customers/12`, `contacts/3`. */
  readonly path: string;
  /** The wording of the "no longer exists" message, which names the record's type. */
  readonly notFoundLabel: string;
  /** How many fields the loading skeleton stands in for. */
  readonly skeletonFields: number;
  /** Renders the form fields for the loaded record; called inside the dialog. */
  readonly renderForm: (
    record: TRecord,
    props: SalesFormDialogFormProps<TRecord> & { onNotFound: () => void },
  ) => ReactElement;
  /** Called after a successful save, before the dialog closes. */
  readonly onSaved: (record: TRecord) => void;
  /** Called when the record turns out to be gone, so the view behind can refresh. */
  readonly onNotFound: () => void;
}

/**
 * A dialog that loads one record and then edits it.
 *
 * It reloads the record by id when it opens rather than trusting the list or drawer behind it, and covers the load's
 * outcomes: not signed in, no permission, no record, a failed request, and success.
 */
export function SalesEditDialog<TRecord>({
  title,
  description,
  className,
  closeTo,
  path,
  notFoundLabel,
  skeletonFields,
  renderForm,
  onSaved,
  onNotFound,
}: SalesEditDialogProps<TRecord>): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [reloadCount, setReloadCount] = useState(0);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly record?: TRecord;
    readonly error?: unknown;
  }>();
  // A 404 while saving means the record is gone just as much as a 404 while loading does.
  const [goneOnSave, setGoneOnSave] = useState(false);
  // Keep the callback out of the effect's dependencies by reading it through a ref: the caller's function is usually
  // a new closure on every render, and a request must not restart because of that.
  const onNotFoundRef = useRef(onNotFound);
  useEffect(() => {
    onNotFoundRef.current = onNotFound;
  }, [onNotFound]);

  const requestKey = `${path}:${reloadCount}`;
  useEffect(() => {
    const controller = new AbortController();
    api.request<{ data: TRecord }>({ path, signal: controller.signal }).then(
      ({ data }) => {
        if (!controller.signal.aborted) {
          setResult({ key: requestKey, record: data });
        }
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ key: requestKey, error });
        // The record no longer exists: tell the view behind, so the list refreshes.
        if (error instanceof ApiClientError && error.status === 404) {
          onNotFoundRef.current();
        }
      },
    );
    return () => controller.abort();
  }, [api, path, requestKey]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;
  const notFound = goneOnSave || status === 404;
  const record = loading ? undefined : result?.record;

  if (record !== undefined && !notFound) {
    return (
      <SalesFormDialog<TRecord>
        title={title}
        description={description}
        className={className}
        closeTo={closeTo}
        submitLabel={t('actions.save')}
        onSaved={onSaved}
        renderForm={(props) =>
          renderForm(record, {
            ...props,
            onNotFound: () => {
              setGoneOnSave(true);
              onNotFoundRef.current();
            },
          })
        }
      />
    );
  }

  let body: ReactElement;
  let footer: ReactElement;
  if (status === 401) {
    body = <SessionExpiredAlert />;
    footer = <CloseFooter label={t('actions.close')} />;
  } else if (notFound || status === 403) {
    // Offer no "Retry", only "Close": retrying cannot succeed.
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {notFound ? notFoundLabel : t('sales.error.forbidden')}
        </AlertDescription>
      </Alert>
    );
    footer = <CloseFooter label={t('actions.close')} />;
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('sales.error.requestFailed')}</AlertDescription>
        <AlertAction>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setReloadCount((count) => count + 1)}
          >
            {t('status.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
    footer = <CloseFooter label={t('actions.cancel')} />;
  } else {
    body = <FormSkeleton fields={skeletonFields} />;
    footer = <CloseFooter label={t('actions.cancel')} />;
  }

  return (
    <RouteDialog
      title={title}
      description={description}
      className={className}
      closeTo={closeTo}
      footer={footer}
    >
      {body}
    </RouteDialog>
  );
}

/** A dialog footer with a single button that closes it. */
function CloseFooter({ label }: { readonly label: string }): ReactElement {
  const { close } = useRouteOverlay();
  return (
    <Button type='button' variant='outline' onClick={() => void close()}>
      {label}
    </Button>
  );
}

/** The loading state of a form: one skeleton label and control per field. */
function FormSkeleton({ fields }: { readonly fields: number }): ReactElement {
  const { t } = useTranslation();
  return (
    <div
      role='status'
      aria-label={t('status.loading')}
      className='flex flex-col gap-5'
    >
      {Array.from({ length: fields }, (_, field) => (
        <div key={field} className='flex flex-col gap-2'>
          <Skeleton className='h-4 w-16' />
          <Skeleton className='h-8 w-full' />
        </div>
      ))}
    </div>
  );
}

function SalesFormBody<TRecord>({
  formId,
  renderForm,
  onSubmittingChange,
  onSaved,
}: {
  readonly formId: string;
  readonly renderForm: (
    props: SalesFormDialogFormProps<TRecord>,
  ) => ReactElement;
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onSaved: (record: TRecord) => void;
}): ReactElement {
  // `useRouteOverlay()` can only be called in a component inside RouteDialog, so the body is its own component.
  const { close } = useRouteOverlay();
  return renderForm({
    formId,
    onSubmittingChange,
    onSubmitted: (record) => {
      onSaved(record);
      void close();
    },
  });
}

function SalesFormFooter({
  formId,
  submitLabel,
  submitting,
}: {
  readonly formId: string;
  readonly submitLabel: string;
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
      {/* The button sits outside the <form> and is linked through the form attribute; while it is disabled, Enter
          does not submit either. */}
      <Button type='submit' form={formId} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('actions.saving') : submitLabel}
      </Button>
    </>
  );
}
