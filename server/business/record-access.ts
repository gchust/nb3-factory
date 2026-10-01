import { defineRecordAccess } from '@nocobase/authorization/core';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseManager } from '@nocobase/db';
import { buildFilter } from '@nocobase/repository-input';

import { SERVICE_RECORD_ACCESS } from './resources.js';

// Registering a record access makes it available for a grant to select. The resolver runs once per request with the
// principal; it returns `true`, `false`, or a filter the database adapter compiles. Never return "all records" for a
// principal with no membership.
export function registerServiceRecordAccess(
  authz: AppAuthorization,
  database: DatabaseManager,
): void {
  authz.recordAccess.define(
    defineRecordAccess(SERVICE_RECORD_ACCESS.all, (access) =>
      access
        .title({ key: 'service.recordAccess.all', ns: 'service' })
        .collections('workOrders')
        .resolver(() => true),
    ),
  );

  authz.recordAccess.define(
    defineRecordAccess(SERVICE_RECORD_ACCESS.assigned, (access) =>
      access
        .title({ key: 'service.recordAccess.assigned', ns: 'service' })
        .collections('workOrders')
        .resolver(({ principal }) =>
          principal.type === 'user'
            ? buildFilter((filter) =>
                filter.string('assigneeId').eq(principal.id),
              )
            : false,
        ),
    ),
  );

  authz.recordAccess.define(
    defineRecordAccess(SERVICE_RECORD_ACCESS.visible, (access) =>
      access
        .title({ key: 'service.recordAccess.visible', ns: 'service' })
        .collections('workOrders')
        .resolver(({ principal }) =>
          principal.type === 'user'
            ? buildFilter((filter) =>
                filter.or([
                  filter.string('assigneeId').eq(principal.id),
                  filter.boolean('confidential').isFalse(),
                ]),
              )
            : buildFilter((filter) => filter.boolean('confidential').isFalse()),
        ),
    ),
  );

  authz.recordAccess.define(
    defineRecordAccess(SERVICE_RECORD_ACCESS.sharedToMe, (access) =>
      access
        .title({ key: 'service.recordAccess.sharedToMe', ns: 'service' })
        .collections('workOrders')
        .resolver(async ({ principal }) => {
          if (principal.type !== 'user') return false;
          const shares = await database
            .connection()
            .query.selectFrom('workOrderShares')
            .select('workOrderId')
            .where('engineerId', '=', principal.id)
            .where('revokedAt', 'is', null)
            .execute();
          if (!shares.length) return false;
          return buildFilter((filter) =>
            filter.or(
              shares.map((share) =>
                filter.string('id').eq(String(share.workOrderId)),
              ),
            ),
          );
        }),
    ),
  );
}
