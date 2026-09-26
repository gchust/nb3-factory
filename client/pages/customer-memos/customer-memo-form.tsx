import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type FormEvent, type ReactElement, useState } from 'react';

import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';

import type { CustomerMemo } from './types.js';

/**
 * The create and edit form, shared by both dialogs.
 *
 * It renders no buttons: the owning overlay puts them in its `footer` and links the submit button through
 * `form={formId}`. Validation is deliberately small — one required, length-bounded name and an optional note — so it
 * runs here against local state and lets the server's own codes confirm it.
 */
export interface CustomerMemoFormProps {
  /** The record being edited; omitted when creating. */
  readonly memo?: CustomerMemo;
  /** The id of the `<form>`, so a submit button outside it can point at it. */
  readonly formId: string;
  /** Called after a successful save with the record the endpoint returned. The form has already shown the toast. */
  readonly onSubmitted: (memo: CustomerMemo) => void;
  /** Called with `true` when submission starts and `false` when it ends; `false` comes before `onSubmitted`. */
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** The endpoint answered 404 while editing: the record has been deleted. */
  readonly onNotFound?: () => void;
}

export function CustomerMemoForm({
  memo,
  formId,
  onSubmitted,
  onSubmittingChange,
  onNotFound,
}: CustomerMemoFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [name, setName] = useState(memo?.name ?? '');
  const [note, setNote] = useState(memo?.note ?? '');
  const [nameError, setNameError] = useState<string>();
  const [noteError, setNoteError] = useState<string>();
  const [rootError, setRootError] = useState<string>();

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setRootError(undefined);
    setNoteError(undefined);

    if (!validateName()) {
      return;
    }
    setNameError(undefined);

    onSubmittingChange?.(true);
    try {
      const { data } = await api.request<{ data: CustomerMemo }>({
        path: memo ? `customer-memos/${memo.id}` : 'customer-memos',
        method: memo ? 'PATCH' : 'POST',
        json: { name, note },
      });
      toast.add({
        type: 'success',
        title: t(
          memo ? 'customerMemos.editSuccess' : 'customerMemos.createSuccess',
        ),
      });
      onSubmittingChange?.(false);
      onSubmitted(data);
    } catch (caught: unknown) {
      onSubmittingChange?.(false);
      if (caught instanceof ApiClientError) {
        if (caught.code === 'CUSTOMER_MEMO_NAME_REQUIRED') {
          setNameError(t('customerMemos.required'));
          return;
        }
        if (caught.code === 'CUSTOMER_MEMO_NAME_TOO_LONG') {
          setNameError(t('customerMemos.nameTooLong'));
          return;
        }
        if (caught.code === 'CUSTOMER_MEMO_NOTE_TOO_LONG') {
          setNoteError(t('customerMemos.noteTooLong'));
          return;
        }
        if (memo && caught.status === 404) {
          onNotFound?.();
          return;
        }
      }
      // Do not surface the backend's raw message: it says nothing a user can act on.
      setRootError(t('customerMemos.requestFailed'));
    }
  }

  function validateName(): boolean {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(t('customerMemos.required'));
      return false;
    }
    if (trimmed.length > 200) {
      setNameError(t('customerMemos.nameTooLong'));
      return false;
    }
    return true;
  }

  return (
    <form id={formId} noValidate onSubmit={(event) => void handleSubmit(event)}>
      <FieldGroup>
        <Field data-invalid={nameError ? true : undefined}>
          <FieldLabel htmlFor={`${formId}-name`}>
            {t('customerMemos.fields.name')}
          </FieldLabel>
          <Input
            id={`${formId}-name`}
            value={name}
            placeholder={t('customerMemos.namePlaceholder')}
            aria-invalid={nameError ? true : undefined}
            onChange={(event) => {
              setName(event.target.value);
              if (nameError) setNameError(undefined);
            }}
          />
          <FieldError>{nameError}</FieldError>
        </Field>

        <Field data-invalid={noteError ? true : undefined}>
          <FieldLabel htmlFor={`${formId}-note`}>
            {t('customerMemos.fields.note')}
          </FieldLabel>
          <Textarea
            id={`${formId}-note`}
            value={note}
            rows={4}
            placeholder={t('customerMemos.notePlaceholder')}
            aria-invalid={noteError ? true : undefined}
            onChange={(event) => {
              setNote(event.target.value);
              if (noteError) setNoteError(undefined);
            }}
          />
          <FieldError>{noteError}</FieldError>
        </Field>

        {rootError ? (
          <p role='alert' className='text-sm text-destructive'>
            {rootError}
          </p>
        ) : null}
      </FieldGroup>
    </form>
  );
}
