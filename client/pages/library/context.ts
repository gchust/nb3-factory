import type { LibraryDocument } from './types.js';

/** What the list page hands to the overlays declared under it. */
export interface LibraryOutletContext {
  /** Reloads the list, keeping what is on screen until the new data arrives. */
  readonly reload: () => void;
}

/** What the detail page hands to the overlays declared under it. */
export interface LibraryDetailOutletContext {
  /** The document on screen, which is what the edit form opens with. */
  readonly document: LibraryDocument;
  /** Takes the document the endpoint just returned, so the detail does not wait for a reload. */
  readonly onChanged: (document: LibraryDocument) => void;
}
