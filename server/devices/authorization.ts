import { defineAuthorizationResource } from '@nocobase/authorization/core';
import {
  defineDatabasePermission,
  type AppAuthorizationService,
} from '@nocobase/app-plugin-authorization';

/**
 * The device inventory's authorization surface. One collection, one composed
 * business resource, and the page resource the menu entry is gated by. All of
 * it is registered into the application's existing Authorization service, so
 * the server — not the page — decides access.
 *
 * The business model is deliberately minimal: a device has only a `code`
 * (编号) and a `name` (名称). An administrator maintains records; an external
 * integration account is granted `view` and nothing else, so its writes are
 * refused by the same decision every endpoint enforces.
 */

export interface DeviceRow {
  id: string;
  code: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export const DEVICES_COLLECTION = 'devices';
/** The composed business resource the rules, permission sets and page name. */
export const DEVICE_RESOURCE_ID = 'devices.inventory';
/** One scope key per resource action; every rule must reuse this key. */
export const DEVICE_SCOPE_KEY = 'devices';

export const DEVICE_RESOURCE = {
  type: 'resource',
  id: DEVICE_RESOURCE_ID,
} as const;

/** Every field the device inventory reads or writes through the API. */
const READ_FIELDS = ['id', 'code', 'name', 'createdAt', 'updatedAt'] as const;
const UPDATE_FIELDS = ['code', 'name', 'updatedAt'] as const;

// A view permission is read-only. A write permission repeats the read base,
// because a repository write returns the row it wrote.
const deviceRead = defineDatabasePermission<DeviceRow, string>((permission) =>
  permission.collection<DeviceRow>(DEVICES_COLLECTION).read([...READ_FIELDS]),
);
const deviceCreate = defineDatabasePermission<DeviceRow, string>((permission) =>
  permission
    .collection<DeviceRow>(DEVICES_COLLECTION)
    .read([...READ_FIELDS])
    .create([...READ_FIELDS]),
);
const deviceEdit = defineDatabasePermission<DeviceRow, string>((permission) =>
  permission
    .collection<DeviceRow>(DEVICES_COLLECTION)
    .read([...READ_FIELDS])
    .update([...UPDATE_FIELDS]),
);
const deviceDelete = defineDatabasePermission<DeviceRow, string>((permission) =>
  permission
    .collection<DeviceRow>(DEVICES_COLLECTION)
    .read([...READ_FIELDS])
    .delete(),
);

export const deviceResource = defineAuthorizationResource(
  DEVICE_RESOURCE_ID,
  (resource) =>
    resource
      .group('devices')
      .title('Devices')
      .action('view', (action) => action.grant(DEVICE_SCOPE_KEY, deviceRead))
      .action('create', (action) =>
        action.grant(DEVICE_SCOPE_KEY, deviceCreate),
      )
      .action('edit', (action) => action.grant(DEVICE_SCOPE_KEY, deviceEdit))
      .action('delete', (action) =>
        action.grant(DEVICE_SCOPE_KEY, deviceDelete),
      ),
);

/**
 * Registers the device inventory into the running Authorization service. Called
 * once from the application provider's `start`, after migrations and seeds.
 */
export function registerDeviceAuthorization(
  authz: AppAuthorizationService,
): void {
  authz.resourceGroups.add({
    name: 'devices',
    title: 'Devices',
    category: 'business',
  });
  authz.db.collections.add({
    name: DEVICES_COLLECTION,
    title: 'Devices',
  });
  deviceResource.register(authz.resources);
  authz.pages.add({
    name: DEVICE_RESOURCE_ID,
    title: 'Device inventory',
    actions: ['access'],
  });
}
