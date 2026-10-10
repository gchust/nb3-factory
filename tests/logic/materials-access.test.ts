// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  canReadMaterial,
  canWriteMaterial,
  type MaterialViewer,
} from '../../server/providers/materials-service.js';

const OWNER = 'user-a';
const OTHER = 'user-b';

function viewer(overrides: Partial<MaterialViewer> = {}): MaterialViewer {
  return {
    userId: OTHER,
    isRoot: false,
    isCurator: false,
    isReader: false,
    ...overrides,
  };
}

const publicDocument = {
  ownerId: OWNER,
  published: true,
  confidential: false,
};
const draft = { ownerId: OWNER, published: false, confidential: false };
const confidential = { ownerId: OWNER, published: true, confidential: true };

describe('who may read a document', () => {
  it('lets the owner read their own document in any state', () => {
    const owner = viewer({ userId: OWNER, isCurator: true });
    expect(canReadMaterial(draft, owner, false)).toBe(true);
    expect(canReadMaterial(confidential, owner, false)).toBe(true);
    expect(canReadMaterial(publicDocument, owner, false)).toBe(true);
  });

  it('lets a reader read a published non-confidential document', () => {
    expect(
      canReadMaterial(publicDocument, viewer({ isReader: true }), false),
    ).toBe(true);
  });

  it('keeps an unpublished draft closed to everyone but its owner', () => {
    expect(canReadMaterial(draft, viewer({ isReader: true }), false)).toBe(
      false,
    );
    expect(canReadMaterial(draft, viewer({ isCurator: true }), false)).toBe(
      false,
    );
  });

  it('opens exactly one shared draft, without publishing it', () => {
    expect(canReadMaterial(draft, viewer({ isReader: true }), true)).toBe(true);
    expect(canReadMaterial(publicDocument, viewer(), true)).toBe(true);
  });

  it('never opens a confidential document through a share', () => {
    expect(
      canReadMaterial(confidential, viewer({ isReader: true }), true),
    ).toBe(false);
    // Only the owner and the root administrator reach it.
    expect(canReadMaterial(confidential, viewer({ userId: OWNER }), true)).toBe(
      true,
    );
    expect(canReadMaterial(confidential, viewer({ isRoot: true }), false)).toBe(
      true,
    );
  });
});

describe('who may write a document', () => {
  it('lets the owner who is a curator write', () => {
    expect(
      canWriteMaterial(
        publicDocument,
        viewer({ userId: OWNER, isCurator: true }),
      ),
    ).toBe(true);
  });

  it('never lets reading imply writing', () => {
    expect(canWriteMaterial(publicDocument, viewer({ isReader: true }))).toBe(
      false,
    );
    // A curator who is not the owner may read a published document but not edit it.
    expect(
      canWriteMaterial(
        publicDocument,
        viewer({ userId: OTHER, isCurator: true }),
      ),
    ).toBe(false);
    // The owner whose role does not include curating may not edit either.
    expect(
      canWriteMaterial(
        publicDocument,
        viewer({ userId: OWNER, isReader: true }),
      ),
    ).toBe(false);
  });

  it('lets the root administrator write anything', () => {
    expect(canWriteMaterial(confidential, viewer({ isRoot: true }))).toBe(true);
  });
});
