/**
 * The field vocabulary a dialog form is described with, and the two conversions between a record and
 * the form's own text values.
 *
 * It lives outside the dialog component so that a page can describe its form, and read the payload it
 * produces, without importing a module that exports React components.
 */

export type FormFieldKind =
  'text' | 'number' | 'textarea' | 'date' | 'datetime' | 'select' | 'checkbox';

export interface FormFieldSpec {
  readonly name: string;
  readonly labelKey: string;
  readonly kind: FormFieldKind;
  readonly required?: boolean;
  /** Choices for a `select`, already translated. */
  readonly options?: readonly { value: string; label: string }[];
  readonly placeholderKey?: string;
  readonly helpKey?: string;
  /** Spans both columns of the dialog grid. */
  readonly full?: boolean;
}

export type FormValues = Record<string, string | boolean>;

/** Fields a dialog edits, as the form holds them: text for every input but a checkbox. */
export function toFormValues(
  fields: readonly FormFieldSpec[],
  record: object | null | undefined,
): FormValues {
  const fieldsByName = record as Record<string, unknown> | null | undefined;
  const values: FormValues = {};
  for (const field of fields) {
    const raw = fieldsByName ? fieldsByName[field.name] : undefined;
    if (field.kind === 'checkbox') {
      values[field.name] = raw === true || raw === 1 || raw === '1';
      continue;
    }
    if (raw === null || raw === undefined) {
      values[field.name] = '';
      continue;
    }
    if (field.kind === 'datetime' || field.kind === 'date') {
      const date = raw instanceof Date ? raw : new Date(scalarText(raw));
      values[field.name] = Number.isNaN(date.getTime())
        ? ''
        : field.kind === 'date'
          ? localDateValue(date)
          : localDateTimeValue(date);
      continue;
    }
    values[field.name] = scalarText(raw);
  }
  return values;
}

/**
 * A stored value as the text an input holds.
 *
 * A record value arrives from the server as data, so this reads the scalars it is known to be rather
 * than coercing whatever it finds into `"[object Object]"`.
 */
function scalarText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return value === null || value === undefined ? '' : JSON.stringify(value);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** `YYYY-MM-DDTHH:mm` in the viewer's own time zone, the form a `datetime-local` input expects. */
function localDateTimeValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function localDateValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Converts the form's text back into the value the API takes.
 *
 * A temporal field is sent as an absolute instant, because a wall-clock string would be read in the
 * server's time zone rather than the viewer's. An emptied select or date is sent as `null`, so that
 * clearing a stored value clears it; an emptied text field is sent as an empty string, and an emptied
 * number is left out so the record keeps its default.
 */
export function toPayload(
  fields: readonly FormFieldSpec[],
  values: FormValues,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    const value = values[field.name];
    if (field.kind === 'checkbox') {
      payload[field.name] = value === true;
      continue;
    }
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) {
      if (
        field.kind === 'select' ||
        field.kind === 'date' ||
        field.kind === 'datetime'
      ) {
        payload[field.name] = null;
      } else if (field.kind !== 'number') {
        payload[field.name] = '';
      }
      continue;
    }
    if (field.kind === 'number') {
      payload[field.name] = Number(text);
      continue;
    }
    if (field.kind === 'date' || field.kind === 'datetime') {
      const date = new Date(field.kind === 'date' ? `${text}T00:00:00` : text);
      payload[field.name] = Number.isNaN(date.getTime())
        ? null
        : date.toISOString();
      continue;
    }
    payload[field.name] = text;
  }
  return payload;
}

/** Fields the user has not filled in yet, in the order they are declared. */
export function missingRequiredFields(
  fields: readonly FormFieldSpec[],
  values: FormValues,
): FormFieldSpec[] {
  return fields.filter((field) => {
    if (!field.required) return false;
    const value = values[field.name];
    if (field.kind === 'checkbox') return value !== true;
    return typeof value !== 'string' || value.trim() === '';
  });
}
