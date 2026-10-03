import type { DatabaseManager } from '@nocobase/db';
import type { NotificationService } from '@nocobase/app-plugin-notification/server';
import type { ServiceLogger } from './logger.js';
import { asIso, rowsOf } from './values.js';

export interface InspectionRunResult {
  created: number;
  skipped: number;
  reminders: number;
}

/**
 * The scheduled side of the service workflow: it opens an inspection plan for
 * every device whose next date has arrived, and reminds the responsible
 * engineer about orders past their deadline. Both are idempotent — the same day
 * re-runs without producing a second plan or a second message.
 */
export class ServiceInspectionService {
  constructor(
    private readonly database: DatabaseManager,
    private readonly notifications: NotificationService,
    private readonly logger: ServiceLogger,
  ) {}

  async generateDailyPlans(now = new Date()): Promise<InspectionRunResult> {
    const today = now.toISOString().slice(0, 10);
    const query = this.database.query();
    const devices = rowsOf<DeviceRow>(
      await query
        .selectFrom('devices')
        .select([
          'id',
          'deviceNo',
          'name',
          'engineerProfileId',
          'serviceEngineerId',
        ])
        .where('status', '=', 'active')
        .where('nextInspectionDate', 'is not', null)
        .where('nextInspectionDate', '<=', today)
        .execute(),
    );

    let created = 0;
    let skipped = 0;
    for (const device of devices) {
      const existing = await query
        .selectFrom('inspections')
        .select('id')
        .where('deviceId', '=', device.id)
        .where('planDate', '=', today)
        .executeTakeFirst();
      if (existing) {
        skipped += 1;
        continue;
      }
      const insert = await query
        .insertInto('inspections')
        .values({
          deviceId: device.id,
          planDate: today,
          assigneeId: device.serviceEngineerId ?? null,
          assigneeProfileId: device.engineerProfileId ?? null,
          status: 'pending',
          result: null,
          completedAt: null,
          createdById: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      const inspectionId = Number(insert.insertId);
      // No cycle scheduling: the plan for this due date is the one the
      // supervisor asked for, and the next date is theirs to set. Clearing it
      // stops the same overdue device producing a fresh plan every day, and
      // removes the fabricated "+90 days" date that did not match the due
      // criterion.
      await query
        .updateTable('devices')
        .set({
          nextInspectionDate: null,
          updatedAt: now,
        })
        .where('id', '=', device.id)
        .execute();
      created += 1;
      if (device.serviceEngineerId) {
        await this.notify(
          `inspection-plan:${inspectionId}`,
          {
            type: 'inspection',
            referenceId: String(inspectionId),
          },
          device.serviceEngineerId,
          '新的设备巡检计划',
          `设备 ${device.deviceNo} ${device.name} 的巡检计划已生成（${today}）。`,
          `/service/inspections`,
        );
      }
    }
    if (created > 0) {
      this.logger.info('Daily inspection plans generated', {
        created,
        skipped,
      });
    }
    return { created, skipped, reminders: 0 };
  }

  async sendOverdueReminders(now = new Date()): Promise<InspectionRunResult> {
    const query = this.database.query();
    // The deadline is compared in JavaScript rather than in SQL: the stored
    // datetime representation differs per dialect and timezone, while both
    // sides are unambiguous once parsed. The candidate set is small (open
    // orders), so the filter belongs here, not in a string comparison.
    const candidates = rowsOf<OrderRow>(
      await query
        .selectFrom('serviceOrders')
        .select([
          'id',
          'orderNo',
          'title',
          'status',
          'deadline',
          'assigneeId',
          'priority',
        ])
        .where('deadline', 'is not', null)
        .where('status', 'in', [
          'pending_accept',
          'pending_process',
          'processing',
          'pending_confirm',
        ])
        .execute(),
    );
    const rows = candidates.filter((order) => {
      const deadline = asIso(order.deadline);
      return deadline != null && new Date(deadline).getTime() < now.getTime();
    });

    const supervisors = rowsOf<{ userId: string }>(
      await query
        .selectFrom('engineerProfiles')
        .select('userId')
        .where('appRole', '=', 'supervisor')
        .where('userId', 'is not', null)
        .execute(),
    );

    let reminders = 0;
    for (const order of rows) {
      const key = `order-overdue-${order.id}-${now.toISOString().slice(0, 10)}`;
      const recipients = new Set<string>();
      if (order.assigneeId) {
        recipients.add(String(order.assigneeId));
      }
      for (const supervisor of supervisors) {
        recipients.add(String(supervisor.userId));
      }
      for (const userId of recipients) {
        await this.notify(
          `${key}:${userId}`,
          { type: 'service-order', referenceId: String(order.id) },
          userId,
          order.priority === 'urgent' ? '紧急工单已超期' : '工单已超期',
          `工单 ${order.orderNo}「${order.title}」已超过截止时间，请及时处理。`,
          `/service/orders/${order.id}`,
        );
        reminders += 1;
      }
    }
    return { created: 0, skipped: 0, reminders };
  }

  async complete(
    inspectionId: number,
    actorId: string,
    result: string,
    now = new Date(),
  ): Promise<boolean> {
    if (!result?.trim()) {
      return false;
    }
    const updated = await this.database
      .query()
      .updateTable('inspections')
      .set({
        status: 'completed',
        result: result.trim(),
        completedAt: now,
        updatedAt: now,
      })
      .where('id', '=', inspectionId)
      .where('status', '=', 'pending')
      .execute();
    return Number(updated.updatedCount ?? 0) > 0 && actorId.length > 0;
  }

  private async notify(
    idempotencyKey: string,
    source: { type: string; referenceId?: string },
    userId: string,
    title: string,
    body: string,
    path: string,
  ): Promise<void> {
    try {
      await this.notifications.send({
        idempotencyKey,
        source,
        messages: {
          inbox: {
            to: userId,
            title,
            body,
            target: { type: 'route', path },
          },
        },
      });
    } catch (error) {
      this.logger.warn('Service reminder could not be sent', { userId, error });
    }
  }
}

interface DeviceRow {
  id: number;
  deviceNo: string;
  name: string;
  engineerProfileId: number | null;
  serviceEngineerId: string | null;
}

interface OrderRow {
  id: number;
  orderNo: string;
  title: string;
  status: string;
  deadline: Date | string | null;
  assigneeId: string | null;
  priority: string;
}
