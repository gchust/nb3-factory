import { defineRecordAccess } from '@nocobase/authorization/core';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import { buildFilter } from '@nocobase/repository-input';

/**
 * Named record selections used by the business permission sets.
 *
 * A resolver sees only the principal, the requested collection and declared
 * parameters, and answers with a filter on the collection's own columns or
 * `false`. Never build a selection from an id supplied by the client.
 */
export function registerServiceRecordAccess(authz: AppAuthorization): void {
  /** Tickets assigned to the acting engineer. */
  authz.recordAccess.define(
    defineRecordAccess('service.tickets.mine', (access) =>
      access
        .title('指派给我的工单')
        .collections('tickets')
        .resolver(({ principal }) => {
          if (principal.type !== 'user') return false;
          return buildFilter((f) =>
            f.number('assigneeId').eq(Number(principal.id)),
          );
        }),
    ),
  );

  /** Unassigned tickets plus those already assigned to the acting engineer. */
  authz.recordAccess.define(
    defineRecordAccess('service.tickets.pool', (access) =>
      access
        .title('待受理工单或指派给我的工单')
        .collections('tickets')
        .resolver(({ principal }) => {
          if (principal.type !== 'user') return false;
          const userId = Number(principal.id);
          return buildFilter((f) =>
            f.or([
              f.number('assigneeId').empty(),
              f.number('assigneeId').eq(userId),
            ]),
          );
        }),
    ),
  );

  /** Every ticket that is not marked confidential. */
  authz.recordAccess.define(
    defineRecordAccess('service.tickets.nonConfidential', (access) =>
      access
        .title('非机密工单')
        .collections('tickets')
        .resolver(() =>
          buildFilter((f) => f.boolean('confidential').isFalse()),
        ),
    ),
  );

  /** Tickets the acting account reported, including ones it created through an integration. */
  authz.recordAccess.define(
    defineRecordAccess('service.tickets.createdByMe', (access) =>
      access
        .title('我创建的工单')
        .collections('tickets')
        .resolver(({ principal }) => {
          if (principal.type !== 'user') return false;
          return buildFilter((f) =>
            f.number('reporterId').eq(Number(principal.id)),
          );
        }),
    ),
  );

  /** Inspections assigned to the acting engineer. */
  authz.recordAccess.define(
    defineRecordAccess('service.inspections.mine', (access) =>
      access
        .title('指派给我的巡检')
        .collections('inspections')
        .resolver(({ principal }) => {
          if (principal.type !== 'user') return false;
          return buildFilter((f) =>
            f.number('assigneeId').eq(Number(principal.id)),
          );
        }),
    ),
  );
}

export const SERVICE_RECORD_ACCESS_KEYS: readonly string[] = [
  'service.tickets.mine',
  'service.tickets.pool',
  'service.tickets.nonConfidential',
  'service.tickets.createdByMe',
  'service.inspections.mine',
];
