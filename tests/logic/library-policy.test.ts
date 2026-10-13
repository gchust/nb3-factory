import { describe, expect, it } from 'vitest';

import {
  canEdit,
  canShare,
  isVisible,
  type DocumentFlags,
} from '../../server/library/policy.ts';

const owner = { userId: 'owner', unrestricted: false };
const reader = { userId: 'reader', unrestricted: false };
const admin = { userId: 'admin', unrestricted: true };

const published: DocumentFlags = {
  id: 'published',
  ownerId: owner.userId,
  published: true,
  confidential: false,
};
const draft: DocumentFlags = {
  id: 'draft',
  ownerId: owner.userId,
  published: false,
  confidential: false,
};
const confidential: DocumentFlags = {
  id: 'confidential',
  ownerId: owner.userId,
  published: true,
  confidential: true,
};

describe('document visibility', () => {
  it('opens published documents to a reader and hides drafts', () => {
    expect(isVisible(published, reader)).toBe(true);
    expect(isVisible(draft, reader)).toBe(false);
  });

  it('shows a draft to the person it was shared with, and only that person', () => {
    // The set is the documents shared with *this* requester, which is why an unrelated person gets an empty one.
    const shared = new Set(['draft']);
    expect(isVisible(draft, reader, shared)).toBe(true);
    expect(
      isVisible(draft, { userId: 'other', unrestricted: false }, new Set()),
    ).toBe(false);
  });

  it('shows the owner everything they own, shared or not', () => {
    expect(isVisible(draft, owner)).toBe(true);
    expect(isVisible(confidential, owner)).toBe(true);
  });

  it('never shows a confidential document to a non-owner, even when shared', () => {
    const shared = new Set(['confidential']);
    expect(isVisible(confidential, reader, shared)).toBe(false);
  });

  it('lets an unrestricted identity see every document', () => {
    expect(isVisible(draft, admin)).toBe(true);
    expect(isVisible(confidential, admin)).toBe(true);
  });
});

describe('document editing', () => {
  it('lets only the owner edit, and never a reader, even of a published document', () => {
    expect(canEdit(published, owner)).toBe(true);
    expect(canEdit(published, reader)).toBe(false);
    expect(canEdit(draft, reader)).toBe(false);
  });

  it('lets an unrestricted identity edit anything', () => {
    expect(canEdit(draft, admin)).toBe(true);
  });
});

describe('document sharing', () => {
  it('never shares a confidential document, not even by its owner', () => {
    expect(canShare(confidential, owner)).toBe(false);
    expect(canShare(confidential, admin)).toBe(false);
  });

  it('shares a non-confidential document only as its owner or an administrator', () => {
    expect(canShare(draft, owner)).toBe(true);
    expect(canShare(draft, reader)).toBe(false);
    expect(canShare(draft, admin)).toBe(true);
  });
});
