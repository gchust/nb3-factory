import { permissionSet } from '@nocobase/authorization/permissions';

import {
  DEVICE_SCOPE_KEY,
  deviceResource,
} from '../../server/devices/authorization.ts';

/**
 * The one job permission set the device inventory ships with. It belongs to the
 * external integration account and grants exactly what that account needs:
 * read the whole device list, and manage its own API key through the existing
 * self-service page. It carries no `create`, `edit` or `delete` grant and no
 * Database Explorer page, so the integration account can neither change device
 * data nor open the settings structure page.
 *
 * The set is a value, not a registration: the seed persists it, and an
 * administrator can edit it afterwards in the authorization backend.
 */

/**
 * The existing API Keys page. Granting it lets the integration account sign in
 * and issue or revoke the named key the external caller uses; the key itself is
 * bound to that account by the public API Keys service, not by this set.
 */
const apiKeysPageGrant = {
  resource: { type: 'page', id: 'api-keys' },
  actions: [{ action: 'access' }],
} as const;

export const deviceIntegrationPermissionSet = permissionSet(
  'device-integration',
)
  .title('Device integration')
  .grant(apiKeysPageGrant)
  .grant(
    deviceResource.reference().grant({
      view: { [DEVICE_SCOPE_KEY]: 'allRecords' },
    }),
  )
  .build();

export const devicePermissionSets = [deviceIntegrationPermissionSet] as const;
