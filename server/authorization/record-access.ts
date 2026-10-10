import { defineRecordAccess } from '@nocobase/authorization/core';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import { recordAccess } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseManager } from '@nocobase/db';
import { buildFilter } from '@nocobase/repository-input';

/**
 * The record selections the after-sales permission model offers.
 *
 * The order scopes answer "which orders may this principal touch", never "all
 * of them": an unauthenticated or non-user principal gets `false`. The shared
 * scope reads the live share table, so revoking a temporary share closes the
 * scope on the next check without touching the permission set.
 */

// Filled by registerServiceRecordAccess. The authorization adapter calls the
// resolver per request, so reading it here is safe once boot has completed.
let databaseManager: DatabaseManager | undefined;

/** Every order. Used for the supervisor scope and as a default. */
export const orderAll = recordAccess.allRecords;

export const orderAssignedAccess = defineRecordAccess(
  'service.order.assigned',
  (access) =>
    access
      .title('Assigned to me')
      .description(
        'Orders I am assigned to, or that I created and have not handed over.',
      )
      .collections('service_orders')
      .resolver(({ principal }) => {
        if (principal.type !== 'user') return false;
        return buildFilter((filter) =>
          filter.or([
            filter.string('assigneeId').eq(principal.id),
            filter.string('createdById').eq(principal.id),
          ]),
        );
      }),
);

/**
 * Order ids a live temporary share of `engineerId` points at.
 *
 * Revoked and expired shares are left out, so the resolver reads the share
 * table on every check and a revocation closes the extra access immediately.
 */
async function liveSharedOrderIds(engineerId: string): Promise<number[]> {
  if (!databaseManager) return [];
  const now = new Date().toISOString();
  const rows = await databaseManager
    .connection()
    .query.selectFrom('service_order_shares')
    .select('orderId')
    .where('engineerId', '=', engineerId)
    .where('revokedAt', 'is', null)
    .where((builder) =>
      builder.or([
        builder('expiresAt', 'is', null),
        builder('expiresAt', '>', now),
      ]),
    )
    .execute();
  return rows
    .map((row) => Number(row.orderId))
    .filter((id) => Number.isFinite(id));
}

export const orderSharedAccess = defineRecordAccess(
  'service.order.shared',
  (access) =>
    access
      .title('Shared with me')
      .description(
        'Orders a supervisor temporarily shared with me for viewing.',
      )
      .collections('service_orders')
      .resolver(async ({ principal }) => {
        if (principal.type !== 'user') return false;
        const ids = await liveSharedOrderIds(principal.id);
        if (ids.length === 0) return false;
        return buildFilter((filter) =>
          filter.and([
            // A confidential order is never opened to a non-owner through a
            // temporary share, even if a share row exists for it.
            filter.boolean('confidential').isFalse(),
            filter.or(ids.map((id) => filter.number('id').eq(id))),
          ]),
        );
      }),
);

/**
 * The read scope an engineer holds: their own work plus what was shared with
 * them. A temporary share is read-only collaboration, so it widens the `view`
 * action only; `process` and `confirm` keep using the narrower assigned scope.
 */
export const orderAssignedOrSharedAccess = defineRecordAccess(
  'service.order.assignedOrShared',
  (access) =>
    access
      .title('Assigned to me or shared with me')
      .description(
        'Orders I am assigned to or created, together with the ordinary orders a supervisor temporarily shared with me for viewing.',
      )
      .collections('service_orders')
      .resolver(async ({ principal }) => {
        if (principal.type !== 'user') return false;
        const ids = await liveSharedOrderIds(principal.id);
        return buildFilter((filter) =>
          filter.or([
            filter.string('assigneeId').eq(principal.id),
            filter.string('createdById').eq(principal.id),
            // A share widens reading, but never for a confidential order: the
            // assignee/creator branches above still reach one they own.
            ...(ids.length > 0
              ? [
                  filter.and([
                    filter.boolean('confidential').isFalse(),
                    filter.or(ids.map((id) => filter.number('id').eq(id))),
                  ]),
                ]
              : []),
          ]),
        );
      }),
);

export const orderObserverAccess = defineRecordAccess(
  'service.order.observer',
  (access) =>
    access
      .title('Explicitly released ordinary orders')
      .description(
        'Non-confidential orders a supervisor explicitly released to observers.',
      )
      .collections('service_orders')
      .resolver(({ principal }) => {
        if (principal.type !== 'user') return false;
        return buildFilter((filter) =>
          filter.and([
            filter.boolean('observerVisible').isTrue(),
            filter.boolean('confidential').isFalse(),
          ]),
        );
      }),
);

/**
 * Shares issued by this principal. A share is row-scoped like any other table:
 * a resolver may only be offered by a permission on the collection it names,
 * so shares have their own scope rather than reusing the order scopes.
 */
export const shareGrantedAccess = defineRecordAccess(
  'service.share.granted',
  (access) =>
    access
      .title('Shares I granted')
      .description('Temporary order shares this principal issued.')
      .collections('service_order_shares')
      .resolver(({ principal }) => {
        if (principal.type !== 'user') return false;
        return buildFilter((filter) =>
          filter.string('grantedById').eq(principal.id),
        );
      }),
);

export const knowledgePublishedAccess = defineRecordAccess(
  'service.knowledge.published',
  (access) =>
    access
      .title('Published knowledge')
      .description('Knowledge entries whose status is published.')
      .collections('repair_knowledge')
      .resolver(() =>
        buildFilter((filter) => filter.string('status').eq('published')),
      ),
);

export const orderAssigned = orderAssignedAccess.reference();
export const orderShared = orderSharedAccess.reference();
export const orderAssignedOrShared = orderAssignedOrSharedAccess.reference();
export const orderObserver = orderObserverAccess.reference();
export const shareGranted = shareGrantedAccess.reference();
export const knowledgePublished = knowledgePublishedAccess.reference();

export function registerServiceRecordAccess(
  authz: AppAuthorization,
  database: DatabaseManager,
): void {
  databaseManager = database;
  // The built-in `allRecords`, `recordsIOwn` and `recordsICreated` are already
  // registered by the plugin; only the after-sales specific scopes are added.
  authz.recordAccess.define(orderAssignedAccess);
  authz.recordAccess.define(orderSharedAccess);
  authz.recordAccess.define(orderAssignedOrSharedAccess);
  authz.recordAccess.define(orderObserverAccess);
  authz.recordAccess.define(shareGrantedAccess);
  authz.recordAccess.define(knowledgePublishedAccess);
}
