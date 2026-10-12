import { definePermissionSet } from '@nocobase/authorization/permission-sets';
import type { PermissionGrant } from '@nocobase/authorization/core';
import type { RestrictionRule } from '@nocobase/authorization/restriction-rules';

import {
  CONFIDENTIALITY_RECORD_ACCESS,
  MATERIALS_COLLECTION,
  MATERIALS_NAMESPACE,
  MATERIALS_PAGE_ID,
  MATERIAL_CREATE_FIELDS,
  MATERIAL_EDITOR_PERMISSION_SET,
  MATERIAL_READ_FIELDS,
  MATERIAL_READER_PERMISSION_SET,
  MATERIAL_UPDATE_FIELDS,
  READABLE_RECORD_ACCESS,
  SHARING_SETTINGS_ID,
} from './constants.js';

/** The record access the built-in database plugin registers for a row's owner. */
const RECORDS_I_OWN = 'recordsIOwn';

function title(key: string): { readonly key: string; readonly ns: string } {
  return { key, ns: MATERIALS_NAMESPACE };
}

/** The page grant: without it the navigation strips the entry and the route refuses to open. */
export function materialsPageGrant(): PermissionGrant {
  return {
    resource: { type: 'page', id: MATERIALS_PAGE_ID },
    actions: [{ action: 'access' }],
  };
}

/** The administrator's `read`/`manage` grant on the sharing settings item. */
export function materialsSharingGrant(): PermissionGrant {
  return {
    resource: { type: 'settings', id: SHARING_SETTINGS_ID },
    actions: [{ action: 'read' }, { action: 'manage' }],
  };
}

interface CollectionAction {
  readonly fields?: readonly string[];
  /** Record Access keys; the collection action is conditional on what they select. */
  readonly recordAccess?: readonly string[];
}

/**
 * One `database.collection` grant.
 *
 * Written as the grant JSON rather than through `DatabasePermissionBuilder` because the builder cannot attach a Record
 * Access to `delete`; a bare delete grant resolves to a scope of `false`, which is `NO_RECORD_ACCESS` rather than "the
 * rows this Record Access chooses".
 */
function collectionGrant(
  actions: Readonly<Record<string, CollectionAction>>,
): PermissionGrant {
  return {
    resource: { type: 'database.collection', id: MATERIALS_COLLECTION },
    actions: Object.entries(actions).map(([action, config]) => ({
      action,
      policy: {
        type: 'database',
        ...(config.fields ? { fields: config.fields } : {}),
        ...(config.recordAccess && config.recordAccess.length > 0
          ? { recordAccess: config.recordAccess }
          : {}),
      },
    })),
  };
}

/**
 * 资料员: maintain the materials they are responsible for, drafts and confidential ones included. Reading someone
 * else's material is not part of the job, so every action is scoped to `recordsIOwn`.
 */
export function materialEditorPermissionSet() {
  return definePermissionSet(MATERIAL_EDITOR_PERMISSION_SET)
    .title(title('permissionSets.materialEditor'))
    .grant(materialsPageGrant())
    .grant(
      collectionGrant({
        read: {
          fields: [...MATERIAL_READ_FIELDS],
          recordAccess: [RECORDS_I_OWN],
        },
        create: {
          fields: [...MATERIAL_CREATE_FIELDS],
          recordAccess: [RECORDS_I_OWN],
        },
        update: {
          fields: [...MATERIAL_UPDATE_FIELDS],
          recordAccess: [RECORDS_I_OWN],
        },
        delete: { recordAccess: [RECORDS_I_OWN] },
      }),
    )
    .build();
}

/**
 * 阅读者: read only. The grant itself is the defense-in-depth predicate — not confidential, and published or shared
 * with this reader — so a reader cannot see a draft of someone else's even by guessing its id. Editing is absent from
 * the set entirely, which is what "reading does not imply editing" means at the permission layer.
 */
export function materialReaderPermissionSet() {
  return definePermissionSet(MATERIAL_READER_PERMISSION_SET)
    .title(title('permissionSets.materialReader'))
    .grant(materialsPageGrant())
    .grant(
      collectionGrant({
        read: {
          fields: [...MATERIAL_READ_FIELDS],
          recordAccess: [READABLE_RECORD_ACCESS],
        },
      }),
    )
    .build();
}

/** The restriction rule that keeps a confidential material out of a mistaken share. */
export const MATERIAL_CONFIDENTIALITY_RULE_KEY = 'materials.confidentiality';

/**
 * Assigned to one reader, this rule intersects every grant they hold: for `read`, `update` and `delete` on the
 * materials table, only rows that are not confidential or that the reader owns survive. The reader set already
 * refuses confidential rows, so the rule exists for the case the set is edited wrongly: grant a reader
 * `allRecords` and this rule still hides the confidential material.
 */
export function materialConfidentialityRule(
  readerUserId: string,
): RestrictionRule {
  return {
    key: MATERIAL_CONFIDENTIALITY_RULE_KEY,
    title: title('restrictionRules.materialsConfidentiality'),
    resource: { type: 'database.collection', id: MATERIALS_COLLECTION },
    actions: ['read', 'update', 'delete'].map((action) => ({
      action,
      selection: {
        type: 'recordAccess' as const,
        key: CONFIDENTIALITY_RECORD_ACCESS,
      },
    })),
    subjects: [{ type: 'user', id: readerUserId }],
    reason:
      '保密资料仅负责人可见，即使误授予了共享或全量权限也不会对阅读者开放。',
  };
}
