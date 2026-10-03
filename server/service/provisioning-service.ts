import type { DatabaseManager } from '@nocobase/db';
import type { UserManagementService } from '@nocobase/app-plugin-users/server';
import type { WorkflowServiceContract } from '@nocobase/app-plugin-workflow/server';

import { permissionSetByRole } from '../../database/seed-data/permission-sets.js';
import type { ServiceConfig } from '../config/service.js';
import type { ServiceLogger } from './logger.js';

/**
 * The workflow service bound under `workflowServiceToken` is the workflow
 * plugin's `WorkflowService`. The published contract exposes only what a caller
 * needs to trigger a run, while materializing a source-managed definition is
 * what makes the definition reachable at all on a fresh database. These two
 * members are read defensively so an application that ships without them falls
 * back to the application-owned acceptance path instead of failing to boot.
 */
interface WorkflowRuntimeService extends WorkflowServiceContract {
  readonly discoverArtifacts: () => Promise<
    readonly { readonly key: string; readonly digest: string }[]
  >;
  readonly ensureArtifactMaterialized: (hash: string) => Promise<unknown>;
}
interface EngineerProfileRow {
  id: number;
  username: string;
  displayName: string | null;
  appRole: string;
  userId: string | null;
}

export interface ProvisioningResult {
  readonly createdUsers: readonly string[];
  readonly boundProfiles: number;
  readonly workflowReady: boolean;
}

/**
 * Binds the demonstration accounts to the seeded engineer profiles and service
 * records, and makes the source-managed acceptance workflow reachable.
 *
 * It is idempotent: a user that already exists under the same username is
 * reused, and a profile that already carries a user id is left alone. It runs
 * only when `service.demoData` is on, which is off in production unless the
 * operator asks for it.
 */
export class ServiceProvisioningService {
  constructor(
    private readonly database: DatabaseManager,
    private readonly users: UserManagementService,
    private readonly workflow: WorkflowServiceContract | undefined,
    private readonly config: ServiceConfig,
    private readonly logger: ServiceLogger,
  ) {}

  async run(): Promise<ProvisioningResult> {
    if (!this.config.demoData) {
      return { createdUsers: [], boundProfiles: 0, workflowReady: false };
    }
    // A runtime that has not run this application's migrations yet (an embedded
    // host, or a focused test that boots the runtime on an empty database) has
    // no service collections to provision against. Skip instead of failing the
    // boot on a table that does not exist.
    if (!(await this.serviceSchemaReady())) {
      return { createdUsers: [], boundProfiles: 0, workflowReady: false };
    }
    const workflowReady = await this.ensureWorkflowArtifact();
    const { createdUsers, boundProfiles } = await this.ensureDemoAccounts();
    return { createdUsers, boundProfiles, workflowReady };
  }

  private async serviceSchemaReady(): Promise<boolean> {
    try {
      return await this.database.builder().hasCollection('engineerProfiles');
    } catch (error) {
      this.logger.warn(
        'Service schema could not be inspected for provisioning',
        {
          error,
        },
      );
      return false;
    }
  }

  private async ensureWorkflowArtifact(): Promise<boolean> {
    const service = this.workflow as unknown as
      WorkflowRuntimeService | undefined;
    if (!service?.discoverArtifacts || !service.ensureArtifactMaterialized) {
      return false;
    }
    try {
      const artifacts = await service.discoverArtifacts();
      const artifact = artifacts.find(
        (item) => item.key === 'service-order-accept',
      );
      if (!artifact) {
        this.logger.warn('Service acceptance workflow artifact was not found');
        return false;
      }
      await service.ensureArtifactMaterialized(artifact.digest);
      return true;
    } catch (error) {
      // A broken artifact must not stop the application from starting; the
      // acceptance route records the failure and applies the transition itself.
      this.logger.warn(
        'Service acceptance workflow could not be materialized',
        {
          error,
        },
      );
      return false;
    }
  }

  private async ensureDemoAccounts(): Promise<{
    createdUsers: string[];
    boundProfiles: number;
  }> {
    const query = this.database.query();
    const rows = (await query
      .selectFrom('engineerProfiles')
      .select(['id', 'username', 'displayName', 'appRole', 'userId'])
      .execute()) as unknown as EngineerProfileRow[];

    const createdUsers: string[] = [];
    let boundProfiles = 0;
    for (const row of rows) {
      const permissionSet = permissionSetByRole[row.appRole];
      if (!permissionSet) {
        continue;
      }
      const user = await this.ensureUser(row, permissionSet, createdUsers);
      if (user && row.userId !== user.id) {
        await query
          .updateTable('engineerProfiles')
          .set({ userId: user.id, updatedAt: new Date() })
          .where('id', '=', row.id)
          .execute();
        boundProfiles += 1;
      }
      if (user) {
        await this.backfillAssignments(row.id, user.id);
      }
    }
    if (createdUsers.length > 0 || boundProfiles > 0) {
      this.logger.info('Service demonstration accounts are ready', {
        createdUsers: createdUsers.length,
        boundProfiles,
      });
    }
    return { createdUsers, boundProfiles };
  }

  private async ensureUser(
    profile: EngineerProfileRow,
    permissionSet: string,
    createdUsers: string[],
  ): Promise<{ id: string } | undefined> {
    if (profile.userId) {
      return { id: String(profile.userId) };
    }
    const page = await this.users.list({
      search: profile.username,
      pageSize: 100,
    });
    const existing = page.items.find(
      (item) => (item.username ?? '') === profile.username,
    );
    if (existing) {
      return { id: String(existing.id) };
    }
    try {
      const created = await this.users.create({
        name: profile.displayName ?? profile.username,
        username: profile.username,
        email: `${profile.username}@service.local`,
        password: this.config.demoPassword,
        roleScopes: { app: [permissionSet] },
      });
      createdUsers.push(profile.username);
      return { id: String(created.id) };
    } catch (error) {
      this.logger.warn('Service demonstration account could not be created', {
        username: profile.username,
        error,
      });
      return undefined;
    }
  }

  /** Points orders, inspections and devices at the account bound to a profile. */
  private async backfillAssignments(
    profileId: number,
    userId: string,
  ): Promise<void> {
    const query = this.database.query();
    const now = new Date();
    await query
      .updateTable('serviceOrders')
      .set({ assigneeId: userId, updatedAt: now })
      .where('assigneeProfileId', '=', profileId)
      .where('assigneeId', 'is', null)
      .execute();
    await query
      .updateTable('inspections')
      .set({ assigneeId: userId, updatedAt: now })
      .where('assigneeProfileId', '=', profileId)
      .where('assigneeId', 'is', null)
      .execute();
    await query
      .updateTable('devices')
      .set({ serviceEngineerId: userId, updatedAt: now })
      .where('engineerProfileId', '=', profileId)
      .where('serviceEngineerId', 'is', null)
      .execute();
  }
}
