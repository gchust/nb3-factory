import { condition } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseScope } from '@nocobase/app-plugin-authorization/server';
import {
  defineRecordAccess,
  type RecordAccessReference,
} from '@nocobase/authorization/core';

import { IT_TICKETS_COLLECTION } from './constants.js';

/**
 * "My own tickets" — the rows whose `submitterId` is the signed-in user.
 *
 * A record access is code, not stored data, so a permission set grant can
 * choose it by key and the resolver decides the scope at check time. Anonymous
 * or non-user principals match nothing rather than everything.
 */
export const itOwnTickets = defineRecordAccess('it.ownTickets', (access) =>
  access
    .title({
      key: 'itSupport.recordAccess.ownTickets',
      ns: 'nb3-factory',
    })
    .description({
      key: 'itSupport.recordAccess.ownTicketsDescription',
      ns: 'nb3-factory',
    })
    .collections(IT_TICKETS_COLLECTION)
    .resolver(({ principal }): DatabaseScope => {
      if (principal.type !== 'user') {
        return false;
      }
      return condition('submitterId', '$eq', principal.id);
    }),
);

/** Serializable reference used in permission options and stored grants. */
export const itOwnTicketsReference: RecordAccessReference<'it.ownTickets'> =
  itOwnTickets.reference();
