import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import { defineRecordAccess } from '@nocobase/authorization/core';
import { buildFilter } from '@nocobase/repository-input';
import { MATERIALS_COLLECTION } from './resources.js';

/**
 * The record access every signed-in reader may choose: non-confidential rows
 * only. It is a column filter on the collection itself, so the same selection
 * narrows `findMany`, `findOne` and `count` for the page and for every tool the
 * assistant calls. Confidential materials stay reachable solely through the
 * built-in `allRecords` access, which only the supervisor holding it has.
 */
export const MATERIALS_PUBLIC_SCOPE = 'materials.public';

export function registerMaterialsRecordAccess(authz: AppAuthorization): void {
  authz.recordAccess.define(
    defineRecordAccess(MATERIALS_PUBLIC_SCOPE, (access) =>
      access
        .title('Non-confidential materials')
        .collections(MATERIALS_COLLECTION)
        .resolver(() =>
          buildFilter((f) => f.boolean('confidential').isFalse()),
        ),
    ),
  );
}
