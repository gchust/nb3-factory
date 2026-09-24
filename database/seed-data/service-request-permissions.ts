import { databaseGrant } from '@nocobase/app-plugin-authorization/server';
import type { DefaultAccessRule } from '@nocobase/authorization/default-access';
import { permissionSet } from '@nocobase/authorization/permissions';
import {
  SERVICE_REQUEST_COLLECTION,
  SERVICE_REQUEST_PAGES,
  SERVICE_REQUEST_PERMISSION_SET_KEY,
} from '../../server/service-request-model.ts';

/**
 * The initial business permission set for this feature, as a value. It is
 * persisted by `database/main/seeds/202610100003_service_request_permission_set.ts`
 * and remains an ordinary administrator-editable configuration afterwards —
 * this module only states the starting point, it grants nobody access by itself.
 *
 * Both test accounts share the set because either one may be the supervisor who
 * accepts a request and either the assignee who receives the in-app message.
 */
export const serviceRequestUser = permissionSet(
  SERVICE_REQUEST_PERMISSION_SET_KEY,
)
  .title('Service request user')
  .grant(
    ...SERVICE_REQUEST_PAGES.map((page) => ({
      resource: { type: 'page', id: page },
      actions: [{ action: 'access' }],
    })),
  )
  .grant(
    databaseGrant(SERVICE_REQUEST_COLLECTION, {
      // The route whitelists the business fields it accepts; the data grant
      // stays at the Collection level so the server-managed timestamps the
      // Repository writes are not mistaken for caller-writable fields.
      read: { fields: '*' },
      create: { fields: '*' },
      update: { fields: '*' },
    }),
  )
  .build();

/**
 * The shared record baseline for the two CRUD actions that consult Record
 * Access. The permission set grants who may act; this says which rows the grant
 * covers, and without it the collection resolves to no row at all. `all` is the
 * intended scope for this two-account feature: every holder sees every request.
 *
 * Persisted by
 * `database/main/seeds/202610100005_service_request_default_access.ts` and, like
 * the permission set, editable afterwards through Settings → Authorization.
 */
export const serviceRequestDefaultAccess: DefaultAccessRule = {
  resource: { type: 'database.collection', id: SERVICE_REQUEST_COLLECTION },
  actions: [
    { action: 'read', scope: { type: 'all' } },
    { action: 'update', scope: { type: 'all' } },
  ],
};
