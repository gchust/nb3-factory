import type { Application } from '@nocobase/app-server/application';
import {
  type JsonObject,
  type ScheduleTargetType,
} from '@nocobase/app-plugin-scheduler/server';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import type { Device, Inspection, Ticket } from '../service/domain.js';
import {
  inspectionServiceToken,
  serviceNotifierToken,
} from '../service/tokens.js';

/**
 * Registers the module's two administrator-visible scheduled tasks with the
 * installed Scheduler plugin, instead of keeping a private cron process.
 *
 * Both tasks point at an application-owned target type, so their firings,
 * results and failures show up in Settings → Scheduled tasks with the same
 * execution history an administrator uses to enable, disable or trigger one
 * by hand. The schedule should not be the only path to the business action:
 * `POST /service/inspections/plan` runs the same service call for the
 * supervisor who wants an immediate result.
 */
export default class ServiceScheduleProvider extends ServiceProvider<Application> {
  public readonly name: string = '@app/service-schedule';

  public override async boot(): Promise<void> {
    const container = this.app.container;
    if (!container.has(schedulerServiceToken)) return;
    const scheduler = container.resolve(schedulerServiceToken);

    scheduler.registerTarget(this.inspectionTarget());
    scheduler.registerTarget(this.overdueTarget());

    scheduler.defineSchedule({
      key: 'service.inspection-daily',
      title: '设备巡检计划生成',
      description:
        '每天 09:00 (Asia/Shanghai) 为已启用且到期未覆盖的设备生成当天巡检任务。',
      schedule: { cron: '0 9 * * *', timezone: 'Asia/Shanghai' },
      target: { type: 'app.service.inspection-daily', config: {} },
    });
    scheduler.defineSchedule({
      key: 'service.ticket-overdue-reminder',
      title: '工单超期提醒',
      description:
        '每天 09:00 (Asia/Shanghai) 检查已超期且未关闭的工单，向负责人发送至多一条站内提醒。',
      schedule: { cron: '0 9 * * *', timezone: 'Asia/Shanghai' },
      target: { type: 'app.service.ticket-overdue', config: {} },
    });

    // 受控的短周期验证入口：与上面的每日计划指向完全相同的目标类型，
    // 因此在 Settings → 计划任务 里可以立即看到“设备巡检/工单超期”的执行结果，
    // 而不必等到次日 09:00。业务动作本身是幂等的（按 设备+日期、按天），
    // 高频执行不会重复生成巡检或重复提醒；提醒的幂等键按天/按计划日期生成。
    scheduler.defineSchedule({
      key: 'service.inspection-daily-check',
      title: '设备巡检计划生成（短周期验证）',
      description:
        '每 30 秒运行一次，与每日计划使用同一目标，用于在计划任务页立即验证巡检生成与超期标记。',
      schedule: { cron: '*/30 * * * * *', timezone: 'Asia/Shanghai' },
      target: { type: 'app.service.inspection-daily', config: {} },
    });
    scheduler.defineSchedule({
      key: 'service.ticket-overdue-check',
      title: '工单超期提醒（短周期验证）',
      description:
        '每 30 秒运行一次，与每日计划使用同一目标，用于在计划任务页立即验证超期提醒执行结果。',
      schedule: { cron: '*/30 * * * * *', timezone: 'Asia/Shanghai' },
      target: { type: 'app.service.ticket-overdue', config: {} },
    });
  }

  private database(): DatabaseManager {
    return this.app.container.resolve(databaseManagerToken);
  }

  private inspectionTarget(): ScheduleTargetType<JsonObject> {
    return {
      type: 'app.service.inspection-daily',
      title: '设备巡检计划生成',
      describe: async () => ({
        targetLabel: '设备巡检计划生成',
        description: '为到期设备生成巡检任务，并把逾期的巡检标记为 overdue。',
        state: 'ready',
      }),
      validate(config) {
        return config !== null &&
          typeof config === 'object' &&
          !Array.isArray(config)
          ? { valid: true }
          : { valid: false, reason: 'config-must-be-an-object' };
      },
      start: async () => {
        try {
          const result = await this.app.container
            .resolve(inspectionServiceToken)
            .planDue(new Date());
          const notifier = this.app.container.resolve(serviceNotifierToken);
          if (result.created > 0)
            await notifier.inspectionPlanned(result.created);
          const deviceRows =
            (await this.database().repository<Device>('devices').findMany()) ??
            [];
          const deviceById = new Map(deviceRows.map((row) => [row.id, row]));
          const overdue = (
            (await this.database()
              .repository<Inspection>('inspections')
              .findMany()) ?? []
          )
            .filter(
              (row) =>
                row.status === 'overdue' &&
                deviceById.get(row.deviceId)?.status !== 'disabled',
            )
            .map((row) => ({
              ...row,
              deviceNo: deviceById.get(row.deviceId)?.deviceNo,
            }));
          if (overdue.length > 0) await notifier.inspectionOverdue(overdue);
          return {
            state: 'completed',
            outcome: 'succeeded',
            result: { created: result.created, overdue: result.overdue },
          };
        } catch (error) {
          return { state: 'failed', reason: messageOf(error) };
        }
      },
    };
  }

  private overdueTarget(): ScheduleTargetType<JsonObject> {
    return {
      type: 'app.service.ticket-overdue',
      title: '工单超期提醒',
      describe: async () => ({
        targetLabel: '工单超期提醒',
        description:
          '查找超过处理时限且尚未关闭的工单，并向负责人发送站内提醒。',
        state: 'ready',
      }),
      validate(config) {
        return config !== null &&
          typeof config === 'object' &&
          !Array.isArray(config)
          ? { valid: true }
          : { valid: false, reason: 'config-must-be-an-object' };
      },
      start: async () => {
        try {
          const nowIso = new Date().toISOString();
          const overdue = (
            (await this.database().repository<Ticket>('tickets').findMany()) ??
            []
          ).filter(
            (ticket) =>
              ticket.status !== 'closed' &&
              typeof ticket.slaDueAt === 'string' &&
              ticket.slaDueAt < nowIso,
          );
          if (overdue.length > 0) {
            await this.app.container
              .resolve(serviceNotifierToken)
              .ticketOverdue(overdue);
          }
          return {
            state: 'completed',
            outcome: 'succeeded',
            result: { reminded: overdue.length },
          };
        } catch (error) {
          return { state: 'failed', reason: messageOf(error) };
        }
      },
    };
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
