import { defineRecordAccess } from '@nocobase/authorization/core';
import { buildFilter } from '@nocobase/repository-input';

/**
 * Selects the materials a regular colleague may read: only rows whose
 * `visibility` is `public`. Anything else is supervisor-only and is invisible
 * both on the materials page and to the assistant, because the same policy is
 * applied to every query.
 *
 * The filter is checked against the collection's fields by the database
 * authorizer, so the row-level boundary cannot be bypassed by a crafted
 * request: an unauthorized row is never returned in the first place.
 */
export const publicMaterials = defineRecordAccess(
  'materials.public',
  (access) =>
    access
      .title('公开资料')
      .description('仅可查看标记为公开的资料')
      .collections('materials')
      .resolver(() =>
        buildFilter((filter) => filter.string('visibility').eq('public')),
      ),
);
