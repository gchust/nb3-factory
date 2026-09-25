import { ApiClientError } from '@nocobase/app-client';

/**
 * The field name the CRM API named in a `CRM_INVALID_INPUT` response, when it
 * named one. The forms use it to move a server-side validation failure onto the
 * matching control, the way a business error code is mapped in `form.md`.
 */
export function validationField(error: ApiClientError): string | undefined {
  if (error.code !== 'CRM_INVALID_INPUT') return undefined;
  const payload = error.payload;
  if (payload && typeof payload === 'object' && 'field' in payload) {
    const field = (payload as { field?: unknown }).field;
    return typeof field === 'string' ? field : undefined;
  }
  return undefined;
}
