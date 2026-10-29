import { randomUUID } from 'node:crypto';
import {
  StoredLifecycleParameters,
  createRepositoryLifecycleStore,
  type ParameterGroup,
} from '@nocobase/lifecycle';
import type { DatabaseManager } from '@nocobase/db';

import {
  HELPDESK_PARAMETER_SCOPE,
  HELPDESK_REMINDER_POLICY,
} from '../lifecycles/helpdesk-ticket.js';

export const DEFAULT_REMINDER_HOURS = 24;

export interface HelpdeskSettings {
  readonly reminderHours: number;
  readonly updatedAt: string | null;
}

const parameterStore = (database: DatabaseManager): StoredLifecycleParameters =>
  new StoredLifecycleParameters(createRepositoryLifecycleStore(database));

const hoursOf = (value: unknown): number => {
  const hours = Number(value);
  return Number.isInteger(hours) && hours >= 1 && hours <= 720
    ? hours
    : DEFAULT_REMINDER_HOURS;
};

/**
 * Effective reminder policy, read from the lifecycle parameter store the
 * runtime itself reads. The code default applies until an administrator saves
 * a version, exactly as it does during a transition or trigger sweep.
 */
export async function readHelpdeskSettings(
  database: DatabaseManager,
): Promise<HelpdeskSettings> {
  const current = await parameterStore(database).read(
    HELPDESK_PARAMETER_SCOPE,
    HELPDESK_REMINDER_POLICY.key,
  );
  const reminderHours = hoursOf(current?.values.reminderHours);
  return {
    reminderHours,
    updatedAt: current?.at ?? null,
  };
}

/**
 * Saves one immutable policy version. The adapter's compare-and-set on the
 * current revision keeps two administrators from silently overwriting each
 * other; a conflict is retried against the new head before it reaches the
 * caller.
 */
export async function writeHelpdeskSettings(
  database: DatabaseManager,
  reminderHours: number,
  actorId: string,
): Promise<HelpdeskSettings> {
  const group: ParameterGroup = HELPDESK_REMINDER_POLICY;
  const store = parameterStore(database);
  const normalized = Math.max(1, Math.min(720, Math.round(reminderHours)));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await store.read(
      HELPDESK_PARAMETER_SCOPE,
      HELPDESK_REMINDER_POLICY.key,
    );
    try {
      const saved = await store.save({
        scope: HELPDESK_PARAMETER_SCOPE,
        group,
        values: { reminderHours: normalized },
        expectedRevision: current?.revision ?? 0,
        requestId: randomUUID(),
        actorId,
        at: new Date().toISOString(),
      });
      return {
        reminderHours: hoursOf(saved.values.reminderHours),
        updatedAt: saved.at,
      };
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? error.code
          : undefined;
      if (code !== 'CONFIGURATION_CONFLICT' || attempt === 2) throw error;
    }
  }
  throw new Error('The reminder policy could not be saved.');
}
