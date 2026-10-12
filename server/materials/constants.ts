/**
 * The names this feature's permission model is written in.
 *
 * Kept apart from the provider and the routes because three places have to agree on them and none of them should import
 * the others: the server provider that registers the resources, the routes that check them, and the seeds that write the
 * permission sets and the confidentiality rule.
 */

/** The page a reader or an editor needs, declared on the client route as `page:materials`. */
export const MATERIALS_PAGE_ID = 'materials';

/** The materials table. Every field below is a column of it. */
export const MATERIALS_COLLECTION = 'materials';

/** The administrator's temporary hand-over rows; one row opens one material to one reader. */
export const MATERIAL_SHARES_COLLECTION = 'materialShares';

/**
 * A settings item, not a data resource: `manage` opens or revokes a share, `read` lists the current ones. Only an
 * administrator holds it, and it is deliberately the one permission that reaches a draft that is not the holder's.
 */
export const SHARING_SETTINGS_ID = 'materials.sharing';

/** How a reader may see a row: not confidential, and published or shared with them. */
export const READABLE_RECORD_ACCESS = 'materials.readable';

/**
 * A restriction rule's selection: not confidential, or the reader's own. Assigned to the reader so confidentiality
 * survives a permission mistake — a reader granted every material still cannot see a confidential one.
 */
export const CONFIDENTIALITY_RECORD_ACCESS = 'materials.confidentiality';

/** The two permission sets the seed creates: 资料员 and 阅读者. */
export const MATERIAL_EDITOR_PERMISSION_SET = 'material-editor';
export const MATERIAL_READER_PERMISSION_SET = 'material-reader';

/** The translation namespace for the model's own titles; the locale files live in `client/locales`. */
export const MATERIALS_NAMESPACE = 'app';

/**
 * A read returns every column; `ownerName` is the one field the API adds rather than stores.
 */
export const MATERIAL_READ_FIELDS = [
  'id',
  'title',
  'body',
  'ownerId',
  'published',
  'confidential',
  'createdAt',
  'updatedAt',
] as const;

/**
 * A create may name these and only these. `ownerId`, `createdAt` and `updatedAt` are accepted so the server can write
 * them; the route overwrites all three with values of its own before the write, so a client cannot choose an owner.
 */
export const MATERIAL_CREATE_FIELDS = [
  'title',
  'body',
  'published',
  'confidential',
  'ownerId',
  'createdAt',
  'updatedAt',
] as const;

/**
 * An update may name these. `ownerId` is absent on purpose: reassigning a material is not a maintenance operation, and
 * a confidential flag is only ever set by its owner.
 */
export const MATERIAL_UPDATE_FIELDS = [
  'title',
  'body',
  'published',
  'confidential',
  'updatedAt',
] as const;
