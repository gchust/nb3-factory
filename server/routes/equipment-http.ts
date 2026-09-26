import type { Context } from 'hono';

import { EquipmentError } from '../providers/equipment.js';

/**
 * Turns a domain failure into its HTTP response. Only an `EquipmentError` is
 * interpreted; anything else is rethrown so a programming error is reported as
 * the server fault it is rather than as a client mistake.
 */
export function equipmentErrorHandler(
  error: Error,
  context: Context,
): Response {
  if (error instanceof EquipmentError) {
    const body = { code: error.code, message: error.message };
    switch (error.code) {
      case 'VALIDATION_ERROR':
        return context.json(body, 422);
      case 'ASSET_CODE_TAKEN':
      case 'EQUIPMENT_UNAVAILABLE':
        return context.json(body, 409);
      case 'EQUIPMENT_NOT_FOUND':
      case 'LOAN_NOT_FOUND':
        return context.json(body, 404);
      default:
        return context.json(body, 500);
    }
  }
  throw error;
}

/** Reads a JSON object body, converting malformed input into a domain error. */
export async function readJsonObject(
  context: Context,
): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await context.req.json();
  } catch {
    throw new EquipmentError(
      'VALIDATION_ERROR',
      'Request body must be valid JSON.',
    );
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new EquipmentError(
      'VALIDATION_ERROR',
      'Request body must be a JSON object.',
    );
  }
  return value as Record<string, unknown>;
}

/** Reads an ISO date string, or a `Date` from an already-parsed body. */
export function readDateField(value: unknown, label: string): Date {
  if (value === undefined || value === null || value === '') {
    throw new EquipmentError('VALIDATION_ERROR', `${label} is required.`);
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new EquipmentError(
        'VALIDATION_ERROR',
        `${label} must be a valid date.`,
      );
    }
    return value;
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new EquipmentError(
      'VALIDATION_ERROR',
      `${label} must be a valid date.`,
    );
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new EquipmentError(
      'VALIDATION_ERROR',
      `${label} must be a valid date.`,
    );
  }
  return date;
}

/** Parses a path segment into a positive integer, or returns `null`. */
export function parsePositiveInteger(value: string | undefined): number | null {
  if (value === undefined || !/^[1-9]\d*$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
