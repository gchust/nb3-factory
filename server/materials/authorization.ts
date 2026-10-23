import {
  defineCompositeResource,
  defineRecordAccess,
  selection,
  type AuthorizationTitle,
} from '@nocobase/authorization/core';
import {
  defineDefaultAccessRule,
  type DefaultAccessRule,
} from '@nocobase/authorization/default-access';
import {
  definePermissionSet,
  type PermissionSet,
} from '@nocobase/authorization/permission-sets';
import {
  defineRestrictionRule,
  type RestrictionRule,
} from '@nocobase/authorization/restriction-rules';
import {
  condition,
  defineDatabasePermission,
  recordAccess,
  type DatabaseScope,
} from '@nocobase/app-plugin-authorization/server';
import type { FilterNode } from '@nocobase/db';

/**
 * The application's own translation namespace. Both `client/locales` and
 * `server/locales` deliver it, so a title written here is readable in the
 * permission workspace and in a recorded decision reason alike.
 */
export const APP_NS = 'nb3-factory';

/** A translation descriptor for a title persisted in a permission grant or a rule. */
const text = (key: string): AuthorizationTitle => ({ key, ns: APP_NS });

/** One row of the materials library (Issue #797). */
export interface Material {
  id: string;
  title: string;
  body: string | null;
  ownerId: string;
  ownerName: string | null;
  published: boolean;
  confidential: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export const MATERIALS_COLLECTION = 'materials';
/** The business operation every materials route authorizes against. */
export const MATERIALS_COMPOSITE = 'materials.library';
/** The one data scope of each composite action; it targets `materials`. */
export const MATERIALS_SCOPE = 'materials';
/** The page permission the library page declares on its route. */
export const MATERIALS_PAGE = 'materials';

/** Published and not confidential: what an ordinary reader reaches without being told about a record. */
export const MATERIALS_PUBLIC = 'materials.public';
/** Everything a reader may see at all: anything non-confidential, plus the contributor's own confidential rows. */
export const MATERIALS_NON_CONFIDENTIAL = 'materials.nonConfidential';

/** Maintains their own materials. */
export const MATERIALS_CONTRIBUTOR_SET = 'materials-contributor';
/** Reads what is open to readers. */
export const MATERIALS_READER_SET = 'materials-reader';

/** The default access every reader reaches without a grant selecting records. */
export const MATERIALS_DEFAULT_ACCESS_RULE = 'materials.published';
/** The restriction that keeps confidential material out of every reader's reach. */
export const MATERIALS_RESTRICTION_RULE = 'materials.confidential';

/**
 * The settings item `@nocobase/app-plugin-authz-sharing-rules` registers for
 * its rule API. The library's share panel is gated by it, so opening a draft to
 * one reader stays an administrator's act.
 */
export const MATERIALS_SHARING_SETTINGS = 'authorization.sharing-rules';
/** The permission workspace subsection the composite is listed under. */
export const MATERIALS_SECTION = 'materials';

const nonConfidential: FilterNode = condition('confidential', '$isFalsy');

/**
 * `confidential = false OR ownerId = me`, and for a principal that is not a user
 * only the first half. A contributor keeps their own confidential material; every
 * other identity — including an account an administrator creates later — loses it
 * even when a rule or a grant selects the record.
 */
function nonConfidentialOrMine(principalId: string | undefined): DatabaseScope {
  if (principalId === undefined) return nonConfidential;
  return {
    kind: 'group',
    logic: 'or',
    items: [nonConfidential, condition('ownerId', '$eq', principalId)],
  };
}

/** Published and not confidential, as one scope. */
const publicScope: FilterNode = {
  kind: 'group',
  logic: 'and',
  items: [
    condition('published', '$isTruly'),
    condition('confidential', '$isFalsy'),
  ],
};

/**
 * The two record access policies the library needs. Both are declared here and
 * registered by the materials provider; nothing in this module touches a
 * database.
 */
export const materialsPublic = defineRecordAccess(MATERIALS_PUBLIC, (access) =>
  access
    .title(text('materials.recordAccess.public'))
    .description(text('materials.recordAccess.publicHint'))
    .collections(MATERIALS_COLLECTION)
    .resolver(() => publicScope),
);

export const materialsNonConfidential = defineRecordAccess(
  MATERIALS_NON_CONFIDENTIAL,
  (access) =>
    access
      .title(text('materials.recordAccess.nonConfidential'))
      .description(text('materials.recordAccess.nonConfidentialHint'))
      .collections(MATERIALS_COLLECTION)
      .resolver(({ principal }) =>
        nonConfidentialOrMine(
          principal.type === 'user' ? principal.id : undefined,
        ),
      ),
);

const publicReference = materialsPublic.reference();
const nonConfidentialReference = materialsNonConfidential.reference();

/**
 * One collection permission per composite action, all bound to `MATERIALS_SCOPE`.
 * Reading fields are the output allowlist and writing fields the input one, so a
 * reader granted view can never reach an update.
 */
const viewPermission = defineDatabasePermission((permission) =>
  permission
    .collection<Material>(MATERIALS_COLLECTION)
    .title(text('materials.permission.view'))
    .options(
      recordAccess.allRecords,
      recordAccess.recordsIOwn,
      publicReference,
      nonConfidentialReference,
    )
    .read((read) => read.allFields()),
);

const createPermission = defineDatabasePermission((permission) =>
  permission
    .collection<Material>(MATERIALS_COLLECTION)
    .title(text('materials.permission.create'))
    .options(recordAccess.allRecords, recordAccess.recordsIOwn)
    // The insert returns the row it wrote, so the create branch reads it back under
    // the create scope: the record that was just stored, and nothing else.
    .read((read) => read.allFields())
    .create((write) => write.allFields()),
);

// Editing and deleting imply reading the row they act on: the read branch gives
// the service the very set of rows the write scope reaches, so a list marks a
// row editable from the authorization decision rather than from a comparison in
// application code.
const editPermission = defineDatabasePermission((permission) =>
  permission
    .collection<Material>(MATERIALS_COLLECTION)
    .title(text('materials.permission.edit'))
    .options(recordAccess.allRecords, recordAccess.recordsIOwn)
    .read((read) => read.allFields())
    .update((write) => write.allFields()),
);

const deletePermission = defineDatabasePermission((permission) =>
  permission
    .collection<Material>(MATERIALS_COLLECTION)
    .title(text('materials.permission.delete'))
    .options(recordAccess.allRecords, recordAccess.recordsIOwn)
    .read((read) => read.allFields())
    .delete(),
);

/**
 * The library as one business operation. Reading, creating, editing and deleting
 * are separate actions because reading is not editing: a reader set holds `view`
 * and nothing else.
 */
export const materialsResource = defineCompositeResource(
  MATERIALS_COMPOSITE,
  (resource) =>
    resource
      .title(text('materials.resourceTitle'))
      .action('view', (action) =>
        action
          .title(text('materials.action.view'))
          .grant(MATERIALS_SCOPE, viewPermission),
      )
      .action('create', (action) =>
        action
          .title(text('materials.action.create'))
          .grant(MATERIALS_SCOPE, createPermission),
      )
      .action('edit', (action) =>
        action
          .title(text('materials.action.edit'))
          .grant(MATERIALS_SCOPE, editPermission),
      )
      .action('delete', (action) =>
        action
          .title(text('materials.action.delete'))
          .grant(MATERIALS_SCOPE, deletePermission),
      ),
);

/** The reference the provider registers and everything else grants against. */
export const materials = materialsResource.reference();

/**
 * A reader reaches published, non-confidential material without anybody granting
 * it record by record: the `view` branch of the composite adds it for every
 * identity, and the restriction below is what removes confidential rows again.
 */
export const materialsPublishedDefaultAccess: DefaultAccessRule =
  defineDefaultAccessRule(MATERIALS_DEFAULT_ACCESS_RULE, materials)
    .scope('view', MATERIALS_SCOPE, selection.recordAccess(MATERIALS_PUBLIC))
    .build();

/**
 * Confidential material never opens to a reader, whatever a grant or a sharing
 * rule selects. The subject is every signed-in identity rather than one account,
 * so an account created later is protected too; the owner of a confidential
 * material is exempt through the selection itself.
 */
export const materialsConfidentialRestriction: RestrictionRule =
  defineRestrictionRule(MATERIALS_RESTRICTION_RULE, materials)
    .title(text('materials.rules.confidential'))
    .reason('Confidential material is closed to readers')
    .subjects({ type: 'authenticated', id: '*' })
    .scope(
      'view',
      MATERIALS_SCOPE,
      selection.recordAccess(MATERIALS_NON_CONFIDENTIAL),
    )
    .scope(
      'edit',
      MATERIALS_SCOPE,
      selection.recordAccess(MATERIALS_NON_CONFIDENTIAL),
    )
    .scope(
      'delete',
      MATERIALS_SCOPE,
      selection.recordAccess(MATERIALS_NON_CONFIDENTIAL),
    )
    .build();

/**
 * The contributor set: the library page, and the three writing actions over the
 * materials they own. Creating is the one action a data scope cannot narrow — the
 * row does not exist yet — so the service stamps the owner from the session.
 */
export const materialsContributorSet: PermissionSet = definePermissionSet(
  MATERIALS_CONTRIBUTOR_SET,
)
  .title(text('materials.permissionSets.contributor'))
  .grant(
    {
      resource: { type: 'page', id: MATERIALS_PAGE },
      actions: [{ action: 'access' }],
    },
    materials.grant({
      view: { [MATERIALS_SCOPE]: 'recordsIOwn' },
      create: { [MATERIALS_SCOPE]: 'allRecords' },
      edit: { [MATERIALS_SCOPE]: 'recordsIOwn' },
      delete: { [MATERIALS_SCOPE]: 'recordsIOwn' },
    }),
  )
  .build();

/**
 * The reader set: the library page and reading only. Choosing nothing for the
 * data scope leaves the records to the default access rule and to sharing, which
 * is exactly what a reader has.
 */
export const materialsReaderSet: PermissionSet = definePermissionSet(
  MATERIALS_READER_SET,
)
  .title(text('materials.permissionSets.reader'))
  .grant(
    {
      resource: { type: 'page', id: MATERIALS_PAGE },
      actions: [{ action: 'access' }],
    },
    materials.grant({ view: { [MATERIALS_SCOPE]: '' } }),
  )
  .build();
