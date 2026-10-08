import { ApiClientError } from '@nocobase/app-client';

/** The messages the materials pages show for a failed load. */
export type MaterialErrorKey =
  | 'materials.error.forbidden'
  | 'materials.error.notFound'
  | 'materials.error.requestFailed';

/**
 * The message a failed load should show. A 403 and a 404 are distinct outcomes
 * for the hidden/absent material boundary, and both are laid out plainly rather
 * than disguised as a generic failure.
 */
export function materialErrorKey(error: unknown): MaterialErrorKey {
  if (error instanceof ApiClientError) {
    if (error.status === 403) return 'materials.error.forbidden';
    if (error.status === 404) return 'materials.error.notFound';
  }
  return 'materials.error.requestFailed';
}

/**
 * Whether a failed request means the session ended, which a retry cannot fix and
 * which the page answers with a sign-in prompt instead.
 */
export function isUnauthenticated(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 401;
}
