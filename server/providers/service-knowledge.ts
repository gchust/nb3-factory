import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { loggingToken } from '@nocobase/app-server/logging';
import { knowledgeBaseManifestServiceToken } from '@nocobase/app-plugin-ai-knowledge-base/server';
import type { KnowledgeBaseManifestStatus } from '@nocobase/app-plugin-ai-knowledge-base/server';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import {
  manualSourceKey,
  recordManualIndexOutcome,
} from '../services/knowledge.js';
import {
  manualIndexServiceToken,
  type ManualIndexOutcome,
  type ManualIndexService,
} from '../services/tokens.js';
import type { DeviceManualRow } from '../services/types.js';

interface VectorDatabaseEntry {
  readonly key: string;
  readonly name?: string;
}

interface AIKnowledgeBaseConfig {
  readonly vectorDatabases?: readonly VectorDatabaseEntry[];
  readonly embeddingModel?: string;
}

/**
 * Loads device manuals into the AI knowledge base and records the real outcome.
 *
 * The AI knowledge base indexes documents into a vector database, which this
 * application does not configure by default. Rather than pretend the manual was
 * indexed, this service checks what is actually available and writes the honest
 * status onto the manual: `ready` only after the manifest was accepted, and
 * `failed` with the specific missing prerequisite otherwise.
 */
export default class ServiceKnowledgeProvider extends ServiceProvider<Application> {
  public readonly name = 'app/service-knowledge';

  public override register(): void {
    this.app.container.singleton(manualIndexServiceToken, () =>
      this.createIndexService(),
    );
  }

  private createIndexService(): ManualIndexService {
    return {
      indexManual: (manualId) => this.indexManual(manualId),
    };
  }

  private get knowledgeConfig(): AIKnowledgeBaseConfig | undefined {
    const ai = this.app.config.get<{ aiKnowledgeBase?: AIKnowledgeBaseConfig }>(
      'ai',
    );
    return ai?.aiKnowledgeBase;
  }

  private async indexManual(manualId: number): Promise<ManualIndexOutcome> {
    const database = this.app.container.resolve(databaseManagerToken);
    const manuals = database.repository<DeviceManualRow>('device_manuals');
    const manual = await manuals.findOne({ filter: { id: manualId } });
    if (!manual) {
      return {
        status: 'failed',
        detail: `Device manual ${manualId} does not exist.`,
      };
    }

    // The document itself is application data, not a knowledge-base artifact:
    // make sure the stored source matches the row before anything downstream
    // looks at it. This also gives a seeded manual its file on a fresh install,
    // where no upload ever ran through the create route.
    const source = manualSourceKey(manual);
    try {
      const disk = this.app.container.resolve(driveManagerToken).use('local');
      if (!(await disk.exists(source))) {
        await disk.put(source, manual.content);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await this.finish(manualId, { status: 'failed', detail });
      return { status: 'failed', detail };
    }

    const serviceDatabase = this.knowledgeConfig?.vectorDatabases?.find(
      (entry) => entry,
    );
    if (!serviceDatabase) {
      await this.finish(manualId, {
        status: 'failed',
        detail:
          'No AI vector database is configured. Add a PostgreSQL + pgvector entry under ai.aiKnowledgeBase.vectorDatabases before manuals can be indexed.',
      });
      return {
        status: 'failed',
        detail: 'No AI vector database is configured.',
      };
    }
    if (!this.app.container.has(knowledgeBaseManifestServiceToken)) {
      await this.finish(manualId, {
        status: 'failed',
        detail:
          'The AI knowledge base plugin is not registered, so the manual cannot be indexed.',
      });
      return {
        status: 'failed',
        detail: 'The AI knowledge base plugin is not registered.',
      };
    }

    const embeddingModel = this.knowledgeConfig?.embeddingModel;
    if (!embeddingModel) {
      await this.finish(manualId, {
        status: 'failed',
        detail:
          'No embedding model is configured for the AI knowledge base, so the manual cannot be vectorized.',
      });
      return { status: 'failed', detail: 'No embedding model is configured.' };
    }

    try {
      const manifests = this.app.container.resolve(
        knowledgeBaseManifestServiceToken,
      );
      const records = await manifests.apply([
        {
          source: { disk: 'local', location: source },
          manifest: {
            key: `device-manual:${manualId}`,
            operation: 'init',
            initiate: {
              disk: 'local',
              name: manual.title,
              vectorDatabase: serviceDatabase.key,
              llmService: 'default',
              embeddingModel,
            },
            files: [{ disk: 'local', locations: [source] }],
          },
        },
      ]);
      const status = records[0]?.status ?? 'PENDING';
      const outcome = mapManifestStatus(
        status,
        records[0]?.errorMessage ?? null,
      );
      await this.finish(manualId, {
        status: outcome.status,
        detail: outcome.detail,
        aiDocumentId: String(records[0]?.id ?? '') || null,
      });
      return outcome;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await this.finish(manualId, { status: 'failed', detail });
      return { status: 'failed', detail };
    }
  }

  private async finish(
    manualId: number,
    outcome: ManualIndexOutcome & { aiDocumentId?: string | null },
  ): Promise<void> {
    const database = this.app.container.resolve(databaseManagerToken);
    const logger = this.app.container.resolve(loggingToken).getLogger();
    try {
      await recordManualIndexOutcome({ database }, manualId, {
        status: outcome.status === 'pending' ? 'processing' : outcome.status,
        detail: outcome.detail,
        aiDocumentId: outcome.aiDocumentId ?? null,
      });
    } catch (error) {
      logger.error(
        { manualId, error },
        'The device manual ingestion outcome could not be recorded.',
      );
    }
  }
}

function mapManifestStatus(
  status: KnowledgeBaseManifestStatus,
  errorMessage: string | null,
): ManualIndexOutcome {
  switch (status) {
    case 'SUCCESS':
      return {
        status: 'ready',
        detail: 'The manual was indexed into the knowledge base.',
      };
    case 'FAILED':
      return {
        status: 'failed',
        detail: errorMessage ?? 'The knowledge base refused the manual.',
      };
    default:
      return {
        status: 'pending',
        detail:
          status === 'PROCESSING'
            ? 'The knowledge base is indexing the manual.'
            : 'The manual is queued for the knowledge base.',
      };
  }
}
