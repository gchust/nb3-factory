import { selection } from '@nocobase/authorization/core';
import { defineRestrictionRule } from '@nocobase/authorization/restriction-rules';

import {
  LIBRARY_RESTRICTION_KEY,
  LIBRARY_SCOPE,
  NOT_CONFIDENTIAL_RECORD_ACCESS,
  libraryDocuments,
} from '../../server/library/authorization.ts';

/**
 * The confidentiality invariant, as a value a seed persists once.
 *
 * A restriction rule intersects what a subject may reach; it never grants. It
 * is the second half of "a confidential document never reaches a reader": the
 * reader's data scope already excludes confidential rows, and this rule keeps
 * them excluded even after an administrator shares one by mistake, because
 * sharing widens a scope and a restriction then narrows the result.
 *
 * The rule targets the reader by user id, so it keeps holding whichever
 * permission set grants the action and survives a later change of set.
 */
export function libraryReaderRestriction(readerId: string) {
  return defineRestrictionRule(
    LIBRARY_RESTRICTION_KEY,
    libraryDocuments.reference(),
  )
    .title({
      key: 'restrictionRules.libraryConfidential',
      ns: 'nb3-factory',
    })
    .subjects({ type: 'user', id: readerId })
    .scope(
      'view',
      LIBRARY_SCOPE,
      selection.recordAccess(NOT_CONFIDENTIAL_RECORD_ACCESS),
    )
    .scope(
      'edit',
      LIBRARY_SCOPE,
      selection.recordAccess(NOT_CONFIDENTIAL_RECORD_ACCESS),
    )
    .reason(
      'A confidential document stays hidden from a reader even when it is shared by mistake.',
    )
    .build();
}
