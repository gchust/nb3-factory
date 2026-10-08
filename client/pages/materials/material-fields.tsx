import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement, ReactNode } from 'react';

import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export interface MaterialFieldsProps {
  readonly titleId: string;
  readonly bodyId: string;
  readonly title: string;
  readonly body: string;
  readonly onTitleChange: (value: string) => void;
  readonly onBodyChange: (value: string) => void;
  readonly disabled: boolean;
  readonly error?: ReactNode;
}

/** The two fields every materials form edits, shared by the create and edit dialogs. */
export function MaterialFields({
  titleId,
  bodyId,
  title,
  body,
  onTitleChange,
  onBodyChange,
  disabled,
  error,
}: MaterialFieldsProps): ReactElement {
  const { t } = useTranslation();
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor={titleId}>{t('materials.field.title')}</FieldLabel>
        <Input
          id={titleId}
          value={title}
          required
          maxLength={200}
          disabled={disabled}
          onChange={(event) => onTitleChange(event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={bodyId}>{t('materials.field.body')}</FieldLabel>
        <Textarea
          id={bodyId}
          value={body}
          required
          rows={8}
          disabled={disabled}
          onChange={(event) => onBodyChange(event.target.value)}
        />
        <FieldDescription>{t('materials.field.bodyHint')}</FieldDescription>
      </Field>
      {error ? <FieldError>{error}</FieldError> : null}
    </FieldGroup>
  );
}
