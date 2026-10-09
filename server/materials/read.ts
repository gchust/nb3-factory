import type { AuthorizationContext } from '@nocobase/app-plugin-authorization';
import { ApiError } from '@nocobase/app-server/router';
import type { DatabaseManager, RepositoryRecord } from '@nocobase/db';

import { MATERIALS_COLLECTION, MATERIALS_RESOURCE_ID } from './resources.js';

/** One material as a client reads it: id as a string, field names camelCase. */
export interface MaterialView {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly confidential: boolean;
}

/**
 * A Repository row's field as text.
 *
 * A row is `Record<string, unknown>`: only the scalar a column can actually
 * hold is rendered, and anything else becomes the empty string rather than
 * `[object Object]`.
 */
function textOf(value: unknown): string {
  switch (typeof value) {
    case 'string':
      return value;
    case 'number':
    case 'bigint':
    case 'boolean':
      return String(value);
    default:
      return '';
  }
}

export function toMaterialView(row: RepositoryRecord): MaterialView {
  return {
    id: textOf(row.id),
    title: textOf(row.title),
    body: textOf(row.body),
    confidential: row.confidential === true,
  };
}

/**
 * The Repository bound to what the caller may read.
 *
 * `authorize` resolves the caller's `app.materials` `view` decision from the
 * request identity; its single `materials` database policy becomes the read
 * scope. A colleague's decision is `confidential = false`, so the confidential
 * row is never selected, and a caller with no `view` grant is refused before
 * any row is read.
 */
export async function scopedMaterialsRepository(
  authorization: AuthorizationContext,
  database: DatabaseManager,
) {
  const decision = await authorization.authorize({
    resource: { type: 'composite', id: MATERIALS_RESOURCE_ID },
    action: 'view',
  });
  const policy = decision.conditions?.database?.[MATERIALS_COLLECTION];
  if (decision.effect === 'deny' || !policy) {
    throw new ApiError({
      status: 'PERMISSION_DENIED',
      reason: 'MATERIALS_READ_DENIED',
      domain: 'materials',
      message: 'You may not read materials.',
    });
  }
  return database.repository(MATERIALS_COLLECTION).withPolicy(policy);
}

/** The fields a selector is allowed to name, so nothing else can be filtered on. */
const SELECTOR_FIELDS = ['id', 'title', 'confidential'] as const;

/**
 * A query string reaches the handler as text, while `id` is an integer column
 * and `confidential` a boolean one. The Repository validates filter values by
 * column type, so a numeric string is converted before it is used.
 */
function coerceSelectorValue(
  field: (typeof SELECTOR_FIELDS)[number],
  value: string | number | boolean,
): string | number | boolean {
  if (field === 'id' && typeof value === 'string' && /^\d+$/.test(value)) {
    return Number(value);
  }
  if (field === 'confidential' && typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return value;
}

/**
 * Builds a Repository filter from a client selector.
 *
 * The legacy `filter` query is a JSON object; only the fields above are read
 * from it, so a caller cannot filter on a field the exposure does not serve.
 */
export function materialSelector(input: {
  id?: string;
  filter?: string;
}): Record<string, string | number | boolean> {
  const selector: Record<string, string | number | boolean> = {};
  if (input.id !== undefined) selector.id = coerceSelectorValue('id', input.id);
  if (input.filter !== undefined) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.filter);
    } catch {
      throw new ApiError({
        status: 'INVALID_ARGUMENT',
        reason: 'MATERIAL_FILTER_INVALID',
        domain: 'materials',
        message: 'The filter must be a JSON object.',
        fieldViolations: [{ field: 'filter', description: 'Not valid JSON.' }],
      });
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new ApiError({
        status: 'INVALID_ARGUMENT',
        reason: 'MATERIAL_FILTER_INVALID',
        domain: 'materials',
        message: 'The filter must be a JSON object.',
        fieldViolations: [
          { field: 'filter', description: 'Not a JSON object.' },
        ],
      });
    }
    for (const field of SELECTOR_FIELDS) {
      const value = (parsed as Record<string, unknown>)[field];
      if (value === undefined) continue;
      if (
        typeof value !== 'string' &&
        typeof value !== 'number' &&
        typeof value !== 'boolean'
      ) {
        throw new ApiError({
          status: 'INVALID_ARGUMENT',
          reason: 'MATERIAL_FILTER_INVALID',
          domain: 'materials',
          message: `The filter field ${field} must be a scalar value.`,
          fieldViolations: [
            { field: `filter.${field}`, description: 'Not a scalar value.' },
          ],
        });
      }
      selector[field] = coerceSelectorValue(field, value);
    }
  }
  return selector;
}
