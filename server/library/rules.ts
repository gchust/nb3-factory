import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { RestrictionRulesAuthorizationApi } from '@nocobase/authorization/restriction-rules';

import { confidentialDocumentsRule } from './resources.js';

/**
 * `AppAuthorization` names the APIs the authorization plugin itself installs.
 * The rule plugins are contributed through `authorization.plugins` in
 * `server/config/authorization.ts`, so their APIs are installed on the same
 * instance at runtime without being part of that type.
 */
type LibraryAuthorization = AppAuthorization & RestrictionRulesAuthorizationApi;

/**
 * Installs the collection-wide confidentiality Restriction Rule.
 *
 * This is the standing security invariant of the feature — a confidential
 * document is never reachable by anyone but its owner, sharing included — so
 * it is put back whenever it is absent. An edit to its substance survives a
 * restart; deleting it does not, because a deleted invariant is exactly the
 * hole it exists to close. `create` is never called for a rule that is already
 * there, so no boot overwrites the administrator's version.
 */
export async function ensureConfidentialDocumentsRule(
  authz: AppAuthorization,
): Promise<void> {
  const { restrictionRules } = authz as LibraryAuthorization;
  if (await restrictionRules.get(confidentialDocumentsRule.key)) {
    return;
  }
  await restrictionRules.create({
    key: confidentialDocumentsRule.key,
    title: confidentialDocumentsRule.title,
    resource: confidentialDocumentsRule.resource,
    actions: confidentialDocumentsRule.actions.map((action) => ({
      action: action.action,
      selection: action.selection,
    })),
    subjects: confidentialDocumentsRule.subjects,
    reason: confidentialDocumentsRule.reason,
  });
}
