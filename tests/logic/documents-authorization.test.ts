// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  DOCUMENT_ADMIN_PERMISSION_SET,
  DOCUMENT_MAINTAINER_PERMISSION_SET,
  DOCUMENT_READER_PERMISSION_SET,
  documentPermissionSetDefinitions,
} from '../../server/authorization/documents.js';
import { shouldRestrictToNonConfidential } from '../../server/providers/documents.js';

const definitions = new Map(
  documentPermissionSetDefinitions.map((definition) => [
    definition.key,
    definition,
  ]),
);

const grants = (key: string) => definitions.get(key)?.grants ?? [];

const compositeActions = (key: string): string[] =>
  grants(key)
    .filter(
      (grant) =>
        grant.resource.type === 'composite' &&
        grant.resource.id === 'documents',
    )
    .flatMap((grant) => grant.actions.map((action) => action.action));

const compositeScopes = (
  key: string,
  action: string,
): Record<string, string> | undefined => {
  const grant = grants(key).find(
    (item) =>
      item.resource.type === 'composite' && item.resource.id === 'documents',
  );
  const target = grant?.actions.find((item) => item.action === action);
  return target?.policy?.scopes as Record<string, string> | undefined;
};

const hasResource = (
  key: string,
  type: string,
  id: string,
  actions: readonly string[],
): boolean =>
  grants(key).some(
    (grant) =>
      grant.resource.type === type &&
      grant.resource.id === id &&
      actions.every((action) =>
        grant.actions.some((item) => item.action === action),
      ),
  );

describe('document permission sets', () => {
  it('defines exactly the three document roles the administration page assigns', () => {
    expect([...definitions.keys()].sort()).toEqual(
      [
        DOCUMENT_ADMIN_PERMISSION_SET,
        DOCUMENT_MAINTAINER_PERMISSION_SET,
        DOCUMENT_READER_PERMISSION_SET,
      ].sort(),
    );
  });

  it('lets every document role open the documents page', () => {
    for (const key of definitions.keys()) {
      expect(hasResource(key, 'page', 'documents', ['access'])).toBe(true);
    }
  });

  it('gives the administrator page and role administration plus every document action', () => {
    const key = DOCUMENT_ADMIN_PERMISSION_SET;
    expect(hasResource(key, 'page', 'documents', ['access'])).toBe(true);
    expect(
      hasResource(key, 'settings', 'documents.administration', [
        'read',
        'manage',
      ]),
    ).toBe(true);
    expect(
      hasResource(key, 'settings', 'authorization.sharing-rules', [
        'read',
        'create',
        'update',
        'delete',
      ]),
    ).toBe(true);
    expect(compositeActions(key).sort()).toEqual(
      ['create', 'delete', 'edit', 'view'].sort(),
    );
    for (const action of ['view', 'create', 'edit', 'delete']) {
      expect(compositeScopes(key, action)).toEqual({
        documents: 'allRecords',
      });
    }
  });

  it('lets a document administrator disable and enable accounts without reading them', () => {
    const key = DOCUMENT_ADMIN_PERMISSION_SET;
    expect(hasResource(key, 'user', '*', ['disable', 'enable'])).toBe(true);
    expect(hasResource(key, 'user', '*', ['read'])).toBe(false);
  });

  it('lets a maintainer create and manage their own documents but not administer roles', () => {
    const key = DOCUMENT_MAINTAINER_PERMISSION_SET;
    expect(compositeActions(key).sort()).toEqual(
      ['create', 'delete', 'edit', 'view'].sort(),
    );
    expect(compositeScopes(key, 'view')).toEqual({
      documents: 'documents.ownOrPublished',
    });
    expect(compositeScopes(key, 'create')).toEqual({
      documents: 'allRecords',
    });
    expect(compositeScopes(key, 'edit')).toEqual({
      documents: 'recordsIOwn',
    });
    expect(compositeScopes(key, 'delete')).toEqual({
      documents: 'recordsIOwn',
    });
    expect(
      hasResource(key, 'settings', 'documents.administration', ['read']),
    ).toBe(false);
    expect(
      hasResource(key, 'settings', 'authorization.sharing-rules', ['read']),
    ).toBe(false);
  });

  it('gives a reader view only', () => {
    const key = DOCUMENT_READER_PERMISSION_SET;
    expect(compositeActions(key)).toEqual(['view']);
    expect(compositeScopes(key, 'view')).toEqual({
      documents: 'documents.publishedPublic',
    });
    expect(
      hasResource(key, 'settings', 'documents.administration', ['read']),
    ).toBe(false);
    expect(
      hasResource(key, 'settings', 'authorization.sharing-rules', ['read']),
    ).toBe(false);
  });
});

describe('document reader restriction', () => {
  it('restricts a reader who has no broader document role', () => {
    expect(
      shouldRestrictToNonConfidential([DOCUMENT_READER_PERMISSION_SET]),
    ).toBe(true);
  });

  it('does not restrict a reader who is also an administrator or maintainer', () => {
    expect(
      shouldRestrictToNonConfidential([
        DOCUMENT_READER_PERMISSION_SET,
        DOCUMENT_ADMIN_PERMISSION_SET,
      ]),
    ).toBe(false);
    expect(
      shouldRestrictToNonConfidential([
        DOCUMENT_READER_PERMISSION_SET,
        DOCUMENT_MAINTAINER_PERMISSION_SET,
      ]),
    ).toBe(false);
  });

  it('does not restrict roles that never had reader access', () => {
    expect(shouldRestrictToNonConfidential([])).toBe(false);
    expect(
      shouldRestrictToNonConfidential([DOCUMENT_MAINTAINER_PERMISSION_SET]),
    ).toBe(false);
  });
});
