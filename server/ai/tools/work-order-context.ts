import { defineTools } from '@nocobase/ai-employee';
import { z } from 'zod';

import { createServiceAccess } from '../../services/access.js';
import { serviceDeskToken } from '../../services/service-desk.js';

/**
 * Read-only grounding for the service assistant.
 *
 * The tool resolves the same `ServiceAccess` the HTTP routes build, so it can
 * only return records the asking user is allowed to read: an engineer gets the
 * customer and device basics for their own work orders, an observer gets the
 * permitted summary, and a confidential order is never widened by asking the
 * assistant instead of the page. The assistant talks about records it can
 * point back to, which is the "cite the business record or document" part of
 * the requirement; it never writes anything here.
 */
export default defineTools({
  scope: 'SPECIFIED',
  execution: 'backend',
  defaultPermission: 'ALLOW',
  requiresContext: true,
  i18n: { namespace: '@nocobase/app' },
  introduction: {
    title: 'Work order context',
    about:
      'Load one permitted work order with its device, customer, published knowledge and available manuals.',
  },
  definition: {
    name: 'service-desk-work-order-context',
    description:
      'Load the work order the user is allowed to see, together with its device, customer, published repair knowledge and available device manuals. Use it before answering a troubleshooting question so the answer can cite a real record.',
    schema: z.object({
      workOrderId: z.string().describe('The work order id to look up.'),
    }),
  },
  dependencies: { desk: serviceDeskToken },
  invoke: async (ctx, args: { workOrderId: string }) => {
    const roles = new Set(ctx.actor.roles);
    if (ctx.actor.isRoot) roles.add('root');
    const access = createServiceAccess(
      {
        id: String(ctx.actor.id),
        type: 'user',
        displayName: String(ctx.actor.id),
      },
      roles,
    );

    const workOrder = (await ctx.deps.desk.getWorkOrder(
      access,
      args.workOrderId,
    )) as Record<string, unknown>;

    const deviceId = workOrder['deviceId'];
    const customerId = workOrder['customerId'];
    const [device, customer, knowledge, manuals] = await Promise.all([
      typeof deviceId === 'string'
        ? ctx.deps.desk.getDevice(access, deviceId).catch(() => undefined)
        : undefined,
      typeof customerId === 'string'
        ? ctx.deps.desk.getCustomer(access, customerId).catch(() => undefined)
        : undefined,
      ctx.deps.desk.listKnowledge(access).catch(() => [] as unknown[]),
      ctx.deps.desk.listManuals(access).catch(() => [] as unknown[]),
    ]);

    const published = (knowledge as { published?: boolean }[]).filter(
      (article) => article.published === true,
    );
    const usableManuals = (manuals as { status?: string }[]).filter(
      (manual) => manual.status === 'available',
    );

    return {
      status: 'success' as const,
      content: {
        workOrder,
        device,
        customer,
        knowledge: published,
        manuals: usableManuals,
      },
    };
  },
});
