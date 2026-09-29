/** Physical connection name of the materials table. */
export const DATABASE_CONNECTION = 'main';
/**
 * Logical collection name, as `db` and the Authorization database plugin know
 * it. The two-part `main.materials` form is only an addressing convenience for
 * multi-connection resolvers; the Repository and the read-policy scope must
 * agree on this logical name or the scope's filter is rejected.
 */
export const MATERIALS_COLLECTION = 'materials';
/** Qualified id, for code that must name the connection explicitly. */
export const MATERIALS_COLLECTION_ID = `${DATABASE_CONNECTION}.${MATERIALS_COLLECTION}`;

/** Read fields returned by the API and exposed to the assistant. */
export const MATERIAL_FIELDS = [
  'id',
  'title',
  'content',
  'createdAt',
  'updatedAt',
] as const;

export interface MaterialRecord {
  id: number;
  title: string;
  content: string;
  /** Absent when the read policy excludes the column, as a colleague's does. */
  confidential?: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

/** Shape the JSON API returns for one material. */
export interface MaterialDto {
  id: number;
  title: string;
  content: string;
  confidential?: boolean;
  createdAt: string;
  updatedAt: string;
}

export function toMaterialDto(record: MaterialRecord): MaterialDto {
  return {
    id: record.id,
    title: record.title,
    content: record.content,
    ...(record.confidential === undefined
      ? {}
      : { confidential: record.confidential }),
    createdAt: new Date(record.createdAt).toISOString(),
    updatedAt: new Date(record.updatedAt).toISOString(),
  };
}
