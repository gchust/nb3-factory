import {
  defineRecordAccess,
  type RecordAccessReference,
} from '@nocobase/authorization/core';
import { condition } from '@nocobase/app-plugin-authorization/server';

/** The Collection every IT repair request is stored in. */
export const IT_TICKETS_COLLECTION = 'itTickets';

/**
 * Selects the requests a signed-in person opened.
 *
 * This is a small, deliberate replacement for the built-in `recordsICreated`,
 * which selects on `createdById`. The repair history keeps `requesterId` as
 * the field that names the employee, so a requester scope has to read that
 * field instead. Nothing here touches the database; the database adapter
 * validates the returned condition against the Collection's columns and
 * compiles it.
 */
export const itSubmittedByMe = defineRecordAccess(
  'it.submittedByMe',
  (access) =>
    access
      .title('Submitted by me')
      .description('Repair requests this person opened')
      .collections(IT_TICKETS_COLLECTION)
      .resolver(({ principal }) =>
        principal.type === 'user'
          ? condition('requesterId', '$eq', principal.id)
          : false,
      ),
);

/** The serializable reference permission sets and grants store. */
export const itSubmittedByMeReference: RecordAccessReference<'it.submittedByMe'> =
  itSubmittedByMe.reference();
