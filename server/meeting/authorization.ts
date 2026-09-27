import type { PermissionGrant } from '@nocobase/authorization/core';
import { defineCompositeResource } from '@nocobase/authorization/core';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import {
  defineDatabasePermission,
  recordAccess,
} from '@nocobase/app-plugin-authorization/server';

/**
 * The application's own i18n namespace. The runtime resolves the client's
 * default namespace to the application package name, so an authorization
 * title stored as `{ key, ns }` is translated by the locale files under
 * `client/locales/`.
 */
export const MEETING_I18N_NAMESPACE: string = 'nb3-factory';

const title = (key: string): { key: string; ns: string } => ({
  key,
  ns: MEETING_I18N_NAMESPACE,
});

/**
 * Reading a room is unrestricted; the composite action still has to be held so
 * an identity that was never granted it cannot list rooms.
 */
const roomRead = defineDatabasePermission((permission) =>
  permission
    .collection('meetingRooms')
    .title(title('meeting.authz.permissions.roomRead'))
    .options(recordAccess.allRecords)
    .default(recordAccess.allRecords)
    .read('*'),
);

/**
 * Maintaining rooms. Only root holds this; the application's own permission
 * set grants `view` alone.
 */
const roomManage = defineDatabasePermission((permission) =>
  permission
    .collection('meetingRooms')
    .title(title('meeting.authz.permissions.roomManage'))
    .options(recordAccess.allRecords)
    .default(recordAccess.allRecords)
    // `read` is composed alongside the mutations because `createOne`/`updateOne`
    // validate their returned selection against the bound read node; a policy
    // with `read: false` refuses the write before it runs. The route never uses
    // this policy to read rooms, so it grants no visibility by itself.
    .read('*')
    .create('*')
    // An explicit writable list, not `'*'`: the wildcard expands to every
    // column including the generated `id`, which the Repository refuses as a
    // write-policy field. Root bypasses this policy entirely.
    .update(['name', 'capacity', 'location', 'description', 'updatedAt'])
    .delete(),
);

/**
 * Reading bookings. The data scope defaults to `recordsIOwn`, so an ordinary
 * employee sees only the bookings they made while root reads every row.
 */
const bookingRead = defineDatabasePermission((permission) =>
  permission
    .collection('meetingBookings')
    .title(title('meeting.authz.permissions.bookingRead'))
    .options(recordAccess.recordsIOwn, recordAccess.allRecords)
    .default(recordAccess.recordsIOwn)
    .read('*'),
);

/**
 * Creating a booking. The overlap invariant is checked against every booking
 * in the room, so the grant is not scoped to the owner's rows. `read` is
 * composed alongside `create` for the same reason as `roomManage`.
 */
const bookingCreate = defineDatabasePermission((permission) =>
  permission
    .collection('meetingBookings')
    .title(title('meeting.authz.permissions.bookingCreate'))
    .options(recordAccess.allRecords)
    .default(recordAccess.allRecords)
    .read('*')
    .create('*'),
);

/**
 * Cancelling a booking: a read/update pair scoped to the owner's rows by
 * default. The read half satisfies `updateOne`'s selection validation.
 */
const bookingUpdate = defineDatabasePermission((permission) =>
  permission
    .collection('meetingBookings')
    .title(title('meeting.authz.permissions.bookingCancel'))
    .options(recordAccess.recordsIOwn, recordAccess.allRecords)
    .default(recordAccess.recordsIOwn)
    .read('*')
    // `cancel` only ever sets the status; naming it keeps the write policy
    // from expanding `'*'` to the generated `id`, which the Repository
    // rejects as a writable field.
    .update(['status', 'updatedAt']),
);

/**
 * Listing rooms and, for root, maintaining them. `view` and `manage` are
 * separate so the employee permission set can be granted one without the
 * other. Each action composes exactly one collection operation, so the
 * authorization decision carries one repository policy per collection.
 */
export const meetingRoomsResource = defineCompositeResource(
  'meeting.rooms',
  (resource) =>
    resource
      .title(title('meeting.authz.rooms'))
      .action('view', (action) =>
        action
          .title(title('meeting.authz.rooms.view'))
          .grant('access', roomRead),
      )
      .action('manage', (action) =>
        action
          .title(title('meeting.authz.rooms.manage'))
          .grant('access', roomManage),
      ),
);

/**
 * The booking lifecycle. `view` and `cancel` are scoped to the owner by
 * default; `book` is not scoped, because the conflict check reads every
 * booking of the room.
 */
export const meetingBookingsResource = defineCompositeResource(
  'meeting.bookings',
  (resource) =>
    resource
      .title(title('meeting.authz.bookings'))
      .action('view', (action) =>
        action
          .title(title('meeting.authz.bookings.view'))
          .grant('access', bookingRead),
      )
      .action('book', (action) =>
        action
          .title(title('meeting.authz.bookings.book'))
          .grant('access', bookingCreate),
      )
      .action('cancel', (action) =>
        action
          .title(title('meeting.authz.bookings.cancel'))
          .grant('access', bookingUpdate),
      ),
);

/**
 * The grants every signed-in employee holds. They are written by the
 * `202609100004_meeting_permissions` seed; building them from the same
 * builders the runtime registers keeps the stored policy shape from drifting
 * away from the definitions.
 */
export const meetingEmployeeGrants: readonly PermissionGrant[] = [
  meetingRoomsResource.reference().grant('view'),
  meetingBookingsResource.reference().grant('view', 'book', 'cancel'),
];

/**
 * Registers the composites, the collections they read, and where the
 * permission workspace lists them. Called once from the meeting provider's
 * `register()`, after the authorization plugin has bound its token.
 */
export function registerMeetingAuthorization(authz: AppAuthorization): void {
  const rooms = authz.compositeResources.define(meetingRoomsResource);
  const bookings = authz.compositeResources.define(meetingBookingsResource);

  authz.database.collections.add({
    name: 'meetingRooms',
    title: title('meeting.authz.collections.rooms'),
  });
  authz.database.collections.add({
    name: 'meetingBookings',
    title: title('meeting.authz.collections.bookings'),
  });

  // The built-in workspace has top-level `business`; a subsection keeps the
  // application's own resources together instead of under `business.other`.
  authz.ui.sections.add({
    name: 'meeting',
    parent: 'business',
    title: title('meeting.authz.section'),
  });
  authz.ui.place(rooms, { section: 'meeting', order: 0 });
  authz.ui.place(bookings, { section: 'meeting', order: 1 });
}
