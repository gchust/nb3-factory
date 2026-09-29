import { createHash } from 'node:crypto';
import type { DatabaseManager } from '@nocobase/db';
import type { NocoBaseDriveManager } from '@nocobase/drive';
import type { KnowledgeBaseManifestService } from '@nocobase/app-plugin-ai-knowledge-base/server';

import {
  DEVICE_MANUAL_DRIVE_DIRECTORY,
  DEVICE_MANUALS,
  DEVICE_MANUAL_KNOWLEDGE_BASE_KEY,
} from '../ai/manuals/manuals.js';

/** The subset of the logging contract this service uses. */
export interface KnowledgeBaseProvisionLogger {
  warn(details: Record<string, unknown>, message: string): void;
  info?(details: Record<string, unknown>, message: string): void;
}

export interface ManualKnowledgeBaseProvisionOptions {
  readonly db: DatabaseManager;
  readonly drive: NocoBaseDriveManager;
  readonly manifests: KnowledgeBaseManifestService;
  /** Allowed storage disk the knowledge base stores its documents on. */
  readonly disk: string;
  readonly logger?: KnowledgeBaseProvisionLogger;
  /** When false, no sample knowledge base or manual document is created. */
  readonly enabled: boolean;
}

interface KnowledgeBaseRow {
  readonly id: string | number;
  readonly key: string;
  readonly knowledgeBaseType: string;
}

/** Fields written when the device-manual base has to be created. */
interface KnowledgeBaseSeed {
  knowledgeBaseType: string;
  knowledgeBaseOuterId: string;
  key: string;
  name: string;
  description: string;
  vectorDatabaseKey: string;
  llmService: string;
  embeddingModel: string;
  vectorStoreProvider: string;
  vectorStoreConfigHash: string;
  vectorStoreUpdatedAt: Date;
  disk: string;
  segmentOptions: { enabled: boolean; chunkSize: number; chunkOverlap: number };
  enabled: boolean;
  documentCount: number;
  characterCount: number;
  aiEmployeeCount: number;
  confirmVectorStoreChanged: Date;
}

export interface ManualKnowledgeBaseOutcome {
  readonly created: boolean;
  readonly baseId: string | number | null;
}

/** The disk-relative location of one built-in manual inside the Drive disk. */
function manualLocation(slug: string): string {
  return `${DEVICE_MANUAL_DRIVE_DIRECTORY}/${slug}.md`;
}

/** The manifest source identity; one manifest covers every built-in manual. */
const MANIFEST_SOURCE_LOCATION = `${DEVICE_MANUAL_DRIVE_DIRECTORY}/manuals.manifest.json`;

/**
 * Provisions the internal device-manual knowledge base and ingests the two
 * fictional manuals shipped with the application.
 *
 * The AI Knowledge Base plugin's declarative Manifest `init` is deliberately
 * not used: it requires an enabled vector database and an enabled LLM service,
 * and this application runs on SQLite with no model configured. The task's
 * requirement is to complete resource maintenance and show the real processing
 * status even when those conditions are absent, so the base is registered
 * directly and the documents are handed to the plugin's public Manifest
 * `append` operation. Retrieval and vectorization then fail for the real
 * reason (no vector database, no model), which is what the workspace reports.
 *
 * The base row is only created when the Knowledge Base tables exist, so a
 * runtime that boots before its plugin migrations run still starts.
 */
export class ManualKnowledgeBaseProvisioner {
  private readonly options: ManualKnowledgeBaseProvisionOptions;

  constructor(options: ManualKnowledgeBaseProvisionOptions) {
    this.options = options;
  }

  /** Idempotent: a second call re-uses the base and the recorded manifest. */
  async ensure(): Promise<ManualKnowledgeBaseOutcome> {
    const { db, logger } = this.options;
    if (!this.options.enabled) {
      return { created: false, baseId: null };
    }
    try {
      if (!(await db.builder().hasCollection('aiKnowledgeBase'))) {
        return { created: false, baseId: null };
      }
    } catch {
      return { created: false, baseId: null };
    }

    const bases = db.repository<KnowledgeBaseRow, KnowledgeBaseSeed>(
      'aiKnowledgeBase',
    );
    let base = await bases.findOne({
      filter: { key: DEVICE_MANUAL_KNOWLEDGE_BASE_KEY },
    });
    let created = false;
    if (!base) {
      base = (
        await bases.createOne({
          values: this.knowledgeBaseValues(),
        })
      ).record;
      created = true;
    }

    // A read-only base cannot receive an append; leave an administrator's
    // choice alone and report nothing further.
    if (base.knowledgeBaseType !== 'LOCAL') {
      logger?.warn(
        {
          knowledgeBaseKey: base.key,
          knowledgeBaseType: base.knowledgeBaseType,
        },
        'Device-manual knowledge base is not LOCAL; skipping manual ingestion',
      );
      return { created, baseId: base.id };
    }

    await this.writeManualFiles();
    await this.options.manifests.apply([
      {
        source: {
          disk: this.options.disk,
          location: MANIFEST_SOURCE_LOCATION,
        },
        manifest: {
          key: DEVICE_MANUAL_KNOWLEDGE_BASE_KEY,
          operation: 'append',
          files: [
            {
              disk: this.options.disk,
              locations: DEVICE_MANUALS.map((manual) =>
                manualLocation(manual.slug),
              ),
            },
          ],
        },
      },
    ]);

    return { created, baseId: base.id };
  }

  /**
   * Values the plugin's KnowledgeBaseManager would write for a LOCAL base.
   * The placeholder vector/LLM references are intentionally non-empty so the
   * record is well-formed; nothing resolves them, so processing reports the
   * real failure rather than pretending to succeed.
   */
  private knowledgeBaseValues(): KnowledgeBaseSeed {
    const vectorConfig = {
      vectorDatabaseKey: 'device-manuals-quality',
      llmService: 'device-manuals-quality',
      embeddingModel: 'device-manuals-quality',
    };
    const now = new Date();
    return {
      knowledgeBaseType: 'LOCAL',
      knowledgeBaseOuterId: `application-seed:${DEVICE_MANUAL_KNOWLEDGE_BASE_KEY}`,
      key: DEVICE_MANUAL_KNOWLEDGE_BASE_KEY,
      name: 'Device manuals',
      description:
        'Internal service manuals for the devices this desk supports, maintained by the service supervisor.',
      ...vectorConfig,
      vectorStoreProvider: 'NocobaseLocalVectorStore',
      vectorStoreConfigHash: createHash('sha256')
        .update(
          JSON.stringify({
            embeddingModel: vectorConfig.embeddingModel,
            llmService: vectorConfig.llmService,
            vectorDatabaseKey: vectorConfig.vectorDatabaseKey,
          }),
        )
        .digest('hex'),
      vectorStoreUpdatedAt: now,
      disk: this.options.disk,
      segmentOptions: { enabled: true, chunkSize: 6000, chunkOverlap: 1200 },
      enabled: true,
      documentCount: 0,
      characterCount: 0,
      aiEmployeeCount: 0,
      confirmVectorStoreChanged: now,
    };
  }

  /** Copies the built-in manuals into the Drive disk the manifest reads from. */
  private async writeManualFiles(): Promise<void> {
    const disk = this.options.drive.use(this.options.disk);
    for (const manual of DEVICE_MANUALS) {
      const location = manualLocation(manual.slug);
      if (await disk.exists(location)) {
        continue;
      }
      await disk.put(location, Buffer.from(manual.content, 'utf8'));
    }
  }
}
