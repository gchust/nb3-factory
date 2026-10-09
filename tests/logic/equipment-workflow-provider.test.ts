// @vitest-environment node
// The QA repair changed the acceptance workflow source, which produces a new
// Artifact digest. On a database that already ran the previous build, the
// previous revision is still enabled and current; the provider must hand the
// key over to this build's revision instead of leaving the old one active.
import { workflowServiceToken } from '@nocobase/app-plugin-workflow/server';
import { databaseManagerToken } from '@nocobase/db';
import { describe, expect, it, vi } from 'vitest';

import EquipmentWorkflowProvider from '../../server/providers/equipment-workflow-provider.js';

const DIGEST = 'a'.repeat(64);

interface Harness {
  readonly provider: EquipmentWorkflowProvider;
  readonly service: {
    readonly discoverArtifacts: ReturnType<typeof vi.fn>;
    readonly ensureArtifactMaterialized: ReturnType<typeof vi.fn>;
  };
  readonly repository: {
    readonly findOne: ReturnType<typeof vi.fn>;
    readonly updateMany: ReturnType<typeof vi.fn>;
    readonly updateOne: ReturnType<typeof vi.fn>;
  };
  boot(): Promise<void>;
}

function createHarness(options: {
  readonly current: Record<string, unknown> | null;
  readonly pluginPresent?: boolean;
  readonly artifacts?: readonly { key: string; digest: string }[];
}): Harness {
  const repository = {
    findOne: vi.fn(async () => options.current),
    updateMany: vi.fn(async () => undefined),
    updateOne: vi.fn(async () => undefined),
  };
  const service = {
    discoverArtifacts: vi.fn(async () => options.artifacts ?? []),
    ensureArtifactMaterialized: vi.fn(async () => 42),
  };
  const container = {
    has: vi.fn(() => options.pluginPresent ?? true),
    resolve: vi.fn((token: unknown) => {
      if (token === workflowServiceToken) return service;
      if (token === databaseManagerToken) {
        return { repository: () => repository };
      }
      throw new Error('unexpected token');
    }),
  };
  const provider = new EquipmentWorkflowProvider({ container } as never);
  return {
    provider,
    service,
    repository,
    boot: () => provider.boot(),
  };
}

describe('EquipmentWorkflowProvider', () => {
  it('activates this build’s revision over an older enabled one', async () => {
    const harness = createHarness({
      current: {
        id: 1,
        hash: 'previous-build-digest',
        enabled: true,
        current: true,
      },
      artifacts: [{ key: 'ticket-acceptance', digest: DIGEST }],
    });

    await harness.boot();

    expect(harness.service.ensureArtifactMaterialized).toHaveBeenCalledWith(
      DIGEST,
    );
    // The stale revision is cleared first, then this build's revision is
    // selected and enabled.
    expect(harness.repository.updateMany).toHaveBeenCalledWith({
      filter: { key: 'ticket-acceptance' },
      values: { current: null, enabled: false },
    });
    expect(harness.repository.updateOne).toHaveBeenCalledWith({
      filter: { id: 42 },
      values: { current: true, enabled: true },
    });
  });

  it('leaves this build’s own enabled revision untouched', async () => {
    const harness = createHarness({
      current: { id: 42, hash: DIGEST, enabled: true, current: true },
      artifacts: [{ key: 'ticket-acceptance', digest: DIGEST }],
    });

    await harness.boot();

    expect(harness.repository.updateOne).not.toHaveBeenCalled();
    expect(harness.repository.updateMany).not.toHaveBeenCalled();
  });

  it('does nothing when the workflow plugin is not registered', async () => {
    const harness = createHarness({
      current: null,
      pluginPresent: false,
    });

    await harness.boot();

    expect(harness.service.discoverArtifacts).not.toHaveBeenCalled();
  });

  it('does nothing when the acceptance Artifact is absent', async () => {
    const harness = createHarness({ current: null, artifacts: [] });

    await harness.boot();

    expect(harness.service.ensureArtifactMaterialized).not.toHaveBeenCalled();
    expect(harness.repository.updateOne).not.toHaveBeenCalled();
  });
});
