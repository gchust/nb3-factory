import { condition } from '@nocobase/app-plugin-authorization';
import { defineRecordAccess } from '@nocobase/authorization/core';

import {
  TICKETS_COLLECTION,
  TICKETS_SUBMITTED_SCOPE,
} from '../../tickets-resources.js';

/**
 * "The tickets I submitted", usable as a record scope in a permission set.
 *
 * The built-in `recordsIOwn` scope is keyed to a column named `ownerId`, so it
 * cannot describe this table. Declaring the scope alongside the collection it
 * belongs to keeps the employee's read restriction in the permission data,
 * where an administrator can see it, instead of in a route's `if` statement.
 */
export function ticketsSubmitted() {
  return defineRecordAccess(TICKETS_SUBMITTED_SCOPE, (access) =>
    access
      .title({ key: 'tickets.recordAccess.submitted', ns: 'crm' })
      .resources({ type: 'database.collection', id: TICKETS_COLLECTION })
      .resolve(({ principal }) => {
        if (principal.type !== 'user') {
          throw new Error(
            'The submitted-tickets scope requires a signed-in user',
          );
        }
        return condition('submitterId', '$eq', principal.id);
      }),
  );
}
