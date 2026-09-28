import { defineCompositeResource } from '@nocobase/authorization/core';
import {
  defineDatabasePermission,
  recordAccess,
} from '@nocobase/app-plugin-authorization/server';

/** The application locale namespace, matching `packageName` in `client/runtime.ts`. */
export const APPLICATION_NAMESPACE = 'nb3-factory';

/** One device as the API and the page see it: the two business fields and the primary key. */
export type Device = {
  id: number;
  code: string;
  name: string;
};

/** A persisted title resolved from the application locale namespace instead of a fixed string. */
export function applicationTitle(key: string): { key: string; ns: string } {
  return { key, ns: APPLICATION_NAMESPACE };
}

export const devicesCollectionTitle = applicationTitle(
  'authorization.devices.collection',
);
export const devicesDataScopeTitle = applicationTitle(
  'authorization.devices.scope',
);
export const devicesSectionTitle = applicationTitle(
  'authorization.devices.section',
);
export const devicesIntegrationSetTitle = applicationTitle(
  'authorization.devices.integrationSet',
);

/**
 * One database permission per operation. Binding a permission to a composite data scope binds every operation it
 * declares, so the read permission carries only `read`: a `view` grant can never widen into a write. A create or
 * update permission carries `read` as well because `createOne`/`updateOne` read the written row back to return it,
 * and a write-only policy would refuse that internal read.
 */
export const deviceRead = defineDatabasePermission<Device, 'allRecords'>(
  (permission) =>
    permission
      .collection<Device>('devices')
      .title(devicesDataScopeTitle)
      .options(recordAccess.allRecords)
      .default(recordAccess.allRecords)
      .read('*'),
);

export const deviceCreate = defineDatabasePermission((permission) =>
  permission
    .collection<Device>('devices')
    .title(devicesDataScopeTitle)
    .read('*')
    .create('*'),
);

export const deviceUpdate = defineDatabasePermission((permission) =>
  permission
    .collection<Device>('devices')
    .title(devicesDataScopeTitle)
    .read('*')
    .update('*'),
);

export const deviceDelete = defineDatabasePermission((permission) =>
  permission
    .collection<Device>('devices')
    .title(devicesDataScopeTitle)
    .delete(),
);

/**
 * The business resource an external caller checks and an administrator grants. Its four actions map one to one onto
 * the four operations above, so read-only access is expressed by granting `view` alone.
 */
export const devices = defineCompositeResource('devices', (resource) =>
  resource
    .title(devicesCollectionTitle)
    .action('view', (action) => action.grant('devices', deviceRead))
    .action('create', (action) => action.grant('devices', deviceCreate))
    .action('edit', (action) => action.grant('devices', deviceUpdate))
    .action('delete', (action) => action.grant('devices', deviceDelete)),
);

export const devicesReference = devices.reference();
