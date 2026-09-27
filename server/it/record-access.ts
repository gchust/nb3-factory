import {
  condition,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization/server';
import { defineRecordAccess } from '@nocobase/authorization/core';

import { IT_TICKETS_COLLECTION, itTitle } from './resources.js';

/**
 * Record access for the employee side: a ticket whose `submitterId` is the
 * signed-in user.
 *
 * The built-in `recordsIOwn`/`recordsICreated` selections are not used because
 * they require an `ownerId`/`createdById` column, and the submitter is this
 * feature's own concept. A non-user principal (a team, a service) never
 * selects anything here rather than silently matching every row.
 */
export function registerItRecordAccess(authz: AppAuthorization): void {
  authz.recordAccess.define(
    defineRecordAccess('it.submittedByMe', (access) =>
      access
        .title(itTitle('it.record.submittedByMe'))
        .collections(IT_TICKETS_COLLECTION)
        .resolver(({ principal }) =>
          principal.type === 'user'
            ? condition('submitterId', '$eq', principal.id)
            : false,
        ),
    ),
  );
}
