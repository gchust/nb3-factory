import type { DocumentRequester } from './types.js';

/** The columns the visibility rules read; a row loaded with only those columns is enough. */
export interface DocumentFlags {
  id: string;
  ownerId: string;
  published: boolean;
  confidential: boolean;
}

/**
 * Whether a person may see a document at all.
 *
 * The rules, in the order they apply:
 *
 * - An unrestricted request sees everything.
 * - The owner sees their own documents whatever their state.
 * - A confidential document is never visible to anyone but its owner, even when an administrator shared it: creating
 *   such a share is refused, and this check is the second line of defence for a row that predates the rule.
 * - Otherwise a document is visible when it is published, or when it is currently shared with this person. A draft
 *   that nobody shared stays with its owner.
 */
export function isVisible(
  document: DocumentFlags,
  requester: DocumentRequester,
  sharedDocumentIds: ReadonlySet<string> = new Set(),
): boolean {
  if (requester.unrestricted) return true;
  if (document.ownerId === requester.userId) return true;
  if (document.confidential) return false;
  if (sharedDocumentIds.has(document.id)) return true;
  return document.published;
}

/** Whether a person may change a document: only its owner may, and reading is never editing. */
export function canEdit(
  document: DocumentFlags,
  requester: DocumentRequester,
): boolean {
  return requester.unrestricted || document.ownerId === requester.userId;
}

/**
 * Whether a person may hand this document to someone else.
 *
 * Sharing is an administrative act, not editorial: it is used to let one person read one draft that is not theirs.
 * A confidential document is never shareable, because no reader other than the owner may ever see it.
 */
export function canShare(
  document: DocumentFlags,
  requester: DocumentRequester,
): boolean {
  if (document.confidential) return false;
  return requester.unrestricted || document.ownerId === requester.userId;
}
