import { ServiceProvider } from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { loggingToken } from '@nocobase/app-server/logging';
import {
  schedulerServiceToken,
  type SchedulerService,
} from '@nocobase/app-plugin-scheduler/server/tokens';
import {
  userRoleScopeRegistryToken,
  type UserRoleScope,
} from '@nocobase/app-plugin-users/server';
import { InspectionService } from '../services/inspections.js';
import { asText } from '../services/values.js';
import { configureServiceFiles } from '../routes/files.js';

const REGION_OPTIONS = [
  { value: 'east', label: '华东区 / East China' },
  { value: 'south', label: '华南区 / South China' },
  { value: 'north', label: '华北区 / North China' },
  { value: 'west', label: '西部区 / West China' },
  { value: 'none', label: '跨区域协作 / Cross-region' },
] as const;

/**
 * Keeps the service team assignment in `serviceMembers` editable from the Users
 * page, so no code path has to hard-code who belongs to which region.
 */
export function createRegionScope(): UserRoleScope {
  return {
    key: 'service-region',
    label: '服务区域 / Service region',
    selection: 'single',
    options: async () =>
      REGION_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
        assignable: true,
        removable: true,
      })),
    get: async (userId, connection) => {
      const row = await connection.query
        .selectFrom('serviceMembers')
        .select('region')
        .where('userId', '=', userId)
        .executeTakeFirst();
      return row?.region ? asText(row.region) : 'none';
    },
    getMany: async (userIds, connection) => {
      if (!userIds.length) return {};
      const rows = await connection.query
        .selectFrom('serviceMembers')
        .select(['userId', 'region'])
        .where('userId', 'in', [...userIds])
        .execute();
      const result: Record<string, string> = {};
      for (const userId of userIds) result[userId] = 'none';
      for (const row of rows) result[String(row.userId)] = String(row.region);
      return result;
    },
    findUserIds: async (role, connection) => {
      const rows = await connection.query
        .selectFrom('serviceMembers')
        .select('userId')
        .where('region', '=', role)
        .execute();
      return rows.map((row) => String(row.userId));
    },
    replace: async (userId, value, connection) => {
      const raw: unknown = Array.isArray(value)
        ? (value as unknown[])[0]
        : value;
      const normalized =
        typeof raw === 'string' && raw !== 'none' ? raw : 'none';
      const now = new Date();
      const existing = await connection.query
        .selectFrom('serviceMembers')
        .select('id')
        .where('userId', '=', userId)
        .executeTakeFirst();
      if (existing) {
        await connection.query
          .updateTable('serviceMembers')
          .set({ region: normalized, updatedAt: now })
          .where('userId', '=', userId)
          .execute();
        return;
      }
      await connection.query
        .insertInto('serviceMembers')
        .values({
          userId,
          region: normalized,
          teamName: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    },
    onDelete: async (userId, connection) => {
      await connection.query
        .deleteFrom('serviceMembers')
        .where('userId', '=', userId)
        .execute();
    },
  };
}

/** The region scope reads the service tables; the database must already be migrated. */
export class ServiceProviderImpl extends ServiceProvider<Application> {
  public readonly name = '@app/service';
  private removeRegionScope?: () => void;

  register(): void {
    if (!this.app.container.has(databaseManagerToken))
      throw new Error('Service core requires the database manager dependency.');
  }

  async boot(): Promise<void> {
    configureServiceFiles(this.app);
    if (this.app.container.has(userRoleScopeRegistryToken)) {
      const registry = this.app.container.resolve(userRoleScopeRegistryToken);
      this.removeRegionScope = registry.register(createRegionScope());
    }
    this.registerInspectionSchedule();
  }

  private registerInspectionSchedule(): void {
    if (!this.app.container.has(schedulerServiceToken)) return;
    const scheduler = this.app.container.resolve<SchedulerService>(
      schedulerServiceToken,
    );
    scheduler.registerTarget({
      type: 'app.service-inspection',
      title: '生成设备巡检任务 / Generate inspection tasks',
      validate: (config) => {
        if (config && typeof config === 'object') return { valid: true };
        return { valid: true };
      },
      start: async () => {
        const inspections = new InspectionService(this.app);
        const result = await inspections.generate();
        this.log(
          `Generated ${result.created} inspection task(s) for ${result.date}, skipped ${result.skipped}`,
        );
        return {
          state: 'completed',
          outcome: 'succeeded',
          result: {
            created: result.created,
            skipped: result.skipped,
            date: result.date,
          },
        };
      },
    });
    scheduler.defineSchedule({
      key: 'service.daily-inspection',
      title: '每日设备巡检任务 / Daily equipment inspection',
      description: '每天 09:00（Asia/Shanghai）生成当天的设备巡检任务。',
      schedule: { cron: '0 9 * * *', timezone: 'Asia/Shanghai' },
      target: { type: 'app.service-inspection', config: {} },
    });
  }

  private log(message: string): void {
    if (this.app.container.has(loggingToken)) {
      this.app.container
        .resolve(loggingToken)
        .getLogger('service')
        .info(message);
    }
  }

  async shutdown(): Promise<void> {
    this.removeRegionScope?.();
    this.removeRegionScope = undefined;
  }
}

export default ServiceProviderImpl;
