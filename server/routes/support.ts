import type { Context } from 'hono';
import type { ServiceContainer } from '@nocobase/service-provider';
import type { AuthorizationEnv } from '@nocobase/authorization/core';
import type { AuthEnv } from '@nocobase/app-plugin-authentication/server';
import type { DatabaseManager } from '@nocobase/db';
import type { NotificationService } from '@nocobase/app-plugin-notification/server';

import type { ServiceOrderService } from '../service/order-service.js';
import type { ServiceOrderQueryService } from '../service/order-query-service.js';
import type { ServiceAttachmentService } from '../service/attachment-service.js';
import type { ServiceShareService } from '../service/share-service.js';
import type { ServiceDashboardService } from '../service/dashboard-service.js';
import type { ServiceInspectionService } from '../service/inspection-service.js';
import type { ServiceKnowledgeService } from '../service/knowledge-service.js';
import type { ServiceAssistantService } from '../service/assistant-service.js';
import type { ServiceConfig } from '../config/service.js';

/** Every application route runs behind the session and the authorization context. */
export type ServiceEnv = AuthEnv & AuthorizationEnv;

export interface ServiceRouteDeps {
  container: ServiceContainer;
  database: DatabaseManager;
  orders: ServiceOrderService;
  queries: ServiceOrderQueryService;
  attachments: ServiceAttachmentService;
  shares: ServiceShareService;
  dashboard: ServiceDashboardService;
  inspections: ServiceInspectionService;
  knowledge: ServiceKnowledgeService;
  assistant: ServiceAssistantService;
  notifications: NotificationService;
  config: ServiceConfig;
}

export function currentUserId(context: Context<ServiceEnv>): string {
  const session = context.get('auth');
  const id = session?.user?.id;
  if (!id) {
    throw new Error('Service route reached without an authenticated session');
  }
  return String(id);
}

export async function parseJsonBody(
  context: Context<ServiceEnv>,
): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await context.req.json();
    return value !== null && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function jsonError(
  context: Context<ServiceEnv>,
  status: 400 | 403 | 404 | 409 | 413 | 422,
  code: string,
  message: string,
) {
  return context.json({ error: { code, message } }, status);
}

export function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function toText(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export type { Context };
