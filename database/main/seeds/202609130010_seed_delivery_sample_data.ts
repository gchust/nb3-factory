import { defineSeed, type SeedDefinition } from '@nocobase/db';

const PROJECT_NAME = 'Cloud Migration Program';
const MILESTONE_NAME = 'Discovery and assessment';
const TASK_IN_PROGRESS = 'Inventory current services';
const TASK_COMPLETED = 'Migration plan sign-off';

/**
 * A fixed demonstration project so a fresh installation has something to show
 * on the delivery pages. Idempotent: it inserts nothing once the sample project
 * exists, and never overwrites data a user has edited.
 */
const seed: SeedDefinition = defineSeed({
  name: '202609130010_seed_delivery_sample_data',

  async run({ query }) {
    const existing = await query
      .selectFrom('deliveryProjects')
      .select('id')
      .where('name', '=', PROJECT_NAME)
      .executeTakeFirst();
    if (existing) return;

    const admin = await query
      .selectFrom('user')
      .select('id')
      .where('username', '=', 'nocobase')
      .limit(1)
      .executeTakeFirst();
    const adminId = admin ? String(admin.id) : null;
    const now = new Date().toISOString();

    const project = await query
      .insertInto('deliveryProjects')
      .values({
        name: PROJECT_NAME,
        clientName: 'Acme Corporation',
        managerId: adminId,
        startDate: '2026-09-01T00:00:00.000Z',
        endDate: '2026-12-31T00:00:00.000Z',
        budgetHours: 480,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const projectId = Number(project.insertId);

    const milestone = await query
      .insertInto('deliveryMilestones')
      .values({
        name: MILESTONE_NAME,
        projectId,
        plannedDate: '2026-09-30T00:00:00.000Z',
        actualDate: null,
        status: 'in_progress',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const milestoneId = Number(milestone.insertId);

    const inProgress = await query
      .insertInto('deliveryTasks')
      .values({
        name: TASK_IN_PROGRESS,
        projectId,
        milestoneId,
        assigneeId: adminId,
        priority: 'high',
        status: 'in_progress',
        plannedDate: '2026-09-20T00:00:00.000Z',
        actualDate: null,
        description: 'Document every running service before planning the move.',
        createdById: adminId,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const inProgressTaskId = Number(inProgress.insertId);

    await query
      .insertInto('deliveryTasks')
      .values({
        name: TASK_COMPLETED,
        projectId,
        milestoneId,
        assigneeId: adminId,
        priority: 'medium',
        status: 'completed',
        plannedDate: '2026-09-10T00:00:00.000Z',
        actualDate: '2026-09-15T00:00:00.000Z',
        description: 'Signed migration plan agreed with the client.',
        createdById: adminId,
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    if (!adminId) return;
    await query
      .insertInto('deliveryTimesheets')
      .values({
        userId: adminId,
        taskId: inProgressTaskId,
        projectId,
        workDate: '2026-09-12T00:00:00.000Z',
        hours: 2,
        description: 'Reviewed the service inventory with the operations team.',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  },
});

export default seed;
