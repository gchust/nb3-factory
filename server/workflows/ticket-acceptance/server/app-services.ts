import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { ServiceToken } from '@nocobase/service-provider';

/**
 * The ticket operations a Workflow run module needs from the application.
 *
 * Declared structurally instead of imported so the Workflow package stays a
 * self-contained run module: the application owns the token, and this package
 * only needs the shape of the one method it calls.
 */
export interface AcceptanceTicketService {
  registerAcceptance(
    id: number,
    input: { actorId?: string | null; noteKind: 'normal' | 'urgent' },
  ): Promise<{
    ticketId: number;
    ticketNo: string;
    status: string;
    priority: string;
    assigneeId: number | null;
    assigneeName: string | null;
    note: string | null;
  }>;
}

export interface ServiceTokens {
  readonly ticketServiceToken: ServiceToken<AcceptanceTicketService>;
}

let cached: Promise<ServiceTokens> | undefined;

/**
 * Resolves the application's service tokens from a Workflow run module.
 *
 * The Workflow engine compiles this package either into the source tree
 * (`server/workflows/<key>/server/…`) or into a content-addressed Artifact
 * (`server/workflows/<key>/<digest>/server/…`, under `dist` in a deployment),
 * so a fixed relative path to `server/service/tokens` cannot work in both
 * layouts. Walking up from this module's own location finds the same file in
 * both, and Node's module cache keeps it identical to the instance the
 * application registered, so the token compares equal at `services.resolve`.
 */
export function loadServiceTokens(): Promise<ServiceTokens> {
  cached ??= resolveServiceTokens().catch((error: unknown) => {
    // Do not cache a failed lookup: a later attempt should be able to retry.
    cached = undefined;
    throw error;
  });
  return cached;
}

async function resolveServiceTokens(): Promise<ServiceTokens> {
  let base = path.dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    // `.ts` first: the development runtime loads the source through tsx, and a
    // build deploys `.js` at the same relative path.
    for (const extension of ['.ts', '.js']) {
      const candidate = path.join(base, 'service', `tokens${extension}`);
      if (!existsSync(candidate)) continue;
      return (await import(pathToFileURL(candidate).href)) as ServiceTokens;
    }
    base = path.dirname(base);
  }
  throw new Error(
    'Unable to locate the application service tokens for the acceptance Workflow.',
  );
}
