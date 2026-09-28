import { definePermissionSet } from '@nocobase/authorization/permission-sets';

import {
  applicationTitle,
  devicesReference,
} from '../../server/devices-resources.ts';

/**
 * The one set the external integration account receives: read the device list and manage its own API keys. It carries
 * no write grant, so the same account can name and revoke the key it reads with but cannot change a device.
 *
 * Kept in `seed-data` rather than inline in the seed so the set's shape is typed by the same builders the runtime
 * uses, and a renamed Collection or data scope fails the build instead of the install.
 */
export const integrationDeviceReader = definePermissionSet(
  'integration-device-reader',
)
  .title(applicationTitle('authorization.devices.integrationSet'))
  .grant(
    {
      resource: { type: 'page', id: 'devices' },
      actions: [{ action: 'access' }],
    },
    {
      resource: { type: 'page', id: 'api-keys' },
      actions: [{ action: 'access' }],
    },
  )
  .grant(devicesReference.grant({ view: { devices: 'allRecords' } }))
  .build();
