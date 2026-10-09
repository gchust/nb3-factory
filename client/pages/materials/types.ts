/**
 * A material row as the application exposes it through the `materials`
 * Repository resource. `confidential` is readable but never writable: it is the
 * flag the server's record-level access rule reads to decide whether the
 * signed-in colleague receives the row at all.
 */
export interface Material {
  readonly id: number;
  readonly title: string;
  readonly body: string;
  readonly confidential: boolean;
}

/**
 * A route param arrives as text, while the `id` column is an integer and the
 * Repository rejects a filter value whose type does not match the column.
 * `null` means the text cannot be a row id, so the caller shows "not found"
 * instead of asking the server for it.
 */
export function toMaterialId(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  return Number(value);
}

/** The two fields a supervisor maintains. */
export interface MaterialDraft {
  readonly title: string;
  readonly body: string;
}

/**
 * What an overlay under the materials page reads from the list to refresh it
 * after a write, so the list does not reload the page it stays mounted behind.
 */
export interface MaterialsOutletContext {
  readonly reload: () => void;
}
/**
 * The edit dialog additionally updates the view it was opened from: the detail
 * drawer passes `onSaved` so its own copy of the record is replaced with what
 * the server returned, without re-requesting it or reloading the page.
 */
export interface MaterialEditOutletContext extends MaterialsOutletContext {
  readonly onSaved?: (material: Material) => void;
}

/**
 * The composite business resource behind this page and the assistant.
 *
 * It must match `MATERIALS_RESOURCE_ID` in `server/materials/resources.ts`; the
 * same server-side permission sets grant the page plus these actions, and the
 * client only uses the id to ask what the signed-in user may do.
 */
export const MATERIALS_RESOURCE_ID = 'app.materials';
