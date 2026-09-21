import { defineSeed } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/** The `APP_NS` sentinel from `@nocobase/i18n`, spelled out so this seed
 * stays self-contained. */
const APPLICATION_NAMESPACE = '@nocobase/i18n/application';

/**
 * Reference data every environment needs: the two laboratories, the people who
 * work in them, and the five business roles.
 *
 * Roles are seeded in two places on purpose. `authorizationPermissionSets` is
 * what an administrator sees and assigns, while `lab_members` records which lab
 * the role applies to. The business rules read `lab_members`; the permission
 * sets exist so the roles are visible and administrable in the Users page.
 */

const CREATED_AT = new Date('2026-01-05T08:00:00.000Z');
const PASSWORD = 'admin123';

interface LaboratorySeed {
  code: string;
  name: string;
  building: string;
  room: string;
  description: string;
}

const LABORATORIES: LaboratorySeed[] = [
  {
    code: 'LAB-A',
    name: '物理测量实验室',
    building: '实验楼 A 座',
    room: 'A-302',
    description: '承担基础物理量值测量与传感器标定教学任务。',
  },
  {
    code: 'LAB-B',
    name: '分析化学实验室',
    building: '实验楼 B 座',
    room: 'B-105',
    description: '承担样品前处理、成分分析与光谱检测教学任务。',
  },
];

type Role =
  'lab_admin' | 'teacher' | 'technician' | 'safety_officer' | 'student';

interface UserSeed {
  username: string;
  name: string;
  permissionSet: string;
  permissionTitle: string;
  role?: Role;
  labCode?: string;
}

const USERS: UserSeed[] = [
  {
    username: 'labadmin',
    name: '王敏（实验室管理员）',
    permissionSet: 'lab-admin',
    permissionTitle: 'permissionSets.labAdmin',
    role: 'lab_admin',
    labCode: 'LAB-A',
  },
  {
    username: 'teacher1',
    name: '孙芳（指导教师）',
    permissionSet: 'lab-teacher',
    permissionTitle: 'permissionSets.labTeacher',
    role: 'teacher',
    labCode: 'LAB-A',
  },
  {
    username: 'tech1',
    name: '陈刚（设备技术员）',
    permissionSet: 'lab-technician',
    permissionTitle: 'permissionSets.labTechnician',
    role: 'technician',
    labCode: 'LAB-A',
  },
  {
    username: 'safety1',
    name: '周涛（安全员）',
    permissionSet: 'lab-safety-officer',
    permissionTitle: 'permissionSets.labSafetyOfficer',
    role: 'safety_officer',
    labCode: 'LAB-A',
  },
  {
    username: 'student1',
    name: '张伟（学生）',
    permissionSet: 'lab-student',
    permissionTitle: 'permissionSets.labStudent',
  },
  {
    username: 'lab2admin',
    name: '李娜（分析化学实验室管理员）',
    permissionSet: 'lab-admin',
    permissionTitle: 'permissionSets.labAdmin',
    role: 'lab_admin',
    labCode: 'LAB-B',
  },
];

const seed = defineSeed({
  name: '202610010010_seed_lab_reference_data',
  async run({ query }) {
    const labIds = new Map<string, number>();

    for (const lab of LABORATORIES) {
      const existing = await query
        .selectFrom('laboratories')
        .select(['id', 'name', 'building', 'room', 'description'])
        .where('code', '=', lab.code)
        .executeTakeFirst();

      if (existing) {
        // Keep already-present rows aligned with the seed without changing ids.
        if (
          existing.name !== lab.name ||
          existing.building !== lab.building ||
          existing.room !== lab.room ||
          existing.description !== lab.description
        ) {
          await query
            .updateTable('laboratories')
            .set({
              name: lab.name,
              building: lab.building,
              room: lab.room,
              description: lab.description,
              updatedAt: CREATED_AT,
            })
            .where('id', '=', existing.id)
            .execute();
        }
        labIds.set(lab.code, Number(existing.id));
        continue;
      }

      await query
        .insertInto('laboratories')
        .values({
          code: lab.code,
          name: lab.name,
          building: lab.building,
          room: lab.room,
          description: lab.description,
          status: 'active',
          createdAt: CREATED_AT,
          updatedAt: CREATED_AT,
        })
        .execute();
      const inserted = await query
        .selectFrom('laboratories')
        .select('id')
        .where('code', '=', lab.code)
        .executeTakeFirstOrThrow();
      labIds.set(lab.code, Number(inserted.id));
    }

    for (const user of USERS) {
      const userId = `demo-${user.username}`;
      const existingUser = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', user.username)
        .executeTakeFirst();

      if (!existingUser) {
        await query
          .insertInto('user')
          .values({
            id: userId,
            name: user.name,
            username: user.username,
            email: `${user.username}@lab.example.com`,
            emailVerified: true,
            createdAt: CREATED_AT,
            updatedAt: CREATED_AT,
          })
          .execute();

        await query
          .insertInto('account')
          .values({
            id: `demo-account-${user.username}`,
            issuer: 'local:credential',
            accountId: userId,
            providerId: 'credential',
            userId,
            password: await hashPassword(PASSWORD),
            createdAt: CREATED_AT,
            updatedAt: CREATED_AT,
          })
          .execute();
      }

      if (user.role && user.labCode) {
        const labId = labIds.get(user.labCode);
        if (labId !== undefined) {
          const membership = await query
            .selectFrom('lab_members')
            .select('id')
            .where('labId', '=', labId)
            .where('userId', '=', userId)
            .executeTakeFirst();
          if (!membership) {
            await query
              .insertInto('lab_members')
              .values({
                labId,
                userId,
                role: user.role,
                createdAt: CREATED_AT,
              })
              .execute();
          } else {
            await query
              .updateTable('lab_members')
              .set({ role: user.role })
              .where('id', '=', membership.id)
              .execute();
          }
        }
      }

      const existingSet = await query
        .selectFrom('authorizationPermissionSets')
        .select('key')
        .where('key', '=', user.permissionSet)
        .executeTakeFirst();
      if (!existingSet) {
        await query
          .insertInto('authorizationPermissionSets')
          .values({
            id: `lab-set-${user.permissionSet}`,
            key: user.permissionSet,
            // `APP_NS` from `@nocobase/i18n` is the sentinel the i18n runtime
            // resolves to whichever package name the generated application
            // carries, so these titles keep their catalogues in
            // `client/locales/` without this seed naming the application.
            title: JSON.stringify({
              key: user.permissionTitle,
              ns: APPLICATION_NAMESPACE,
            }),
            // No grants, exactly like the built-in root and member sets. Access
            // is decided by the application's own lab membership rules, so there
            // is nothing here an administrator could delete and nothing a route
            // rename could invalidate.
            grants: JSON.stringify([]),
            createdAt: CREATED_AT,
            updatedAt: CREATED_AT,
          })
          .execute();
      }

      const assignmentId = `user:${userId}:${user.permissionSet}`;
      const existingAssignment = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('id', '=', assignmentId)
        .executeTakeFirst();
      if (!existingAssignment) {
        await query
          .insertInto('authorizationPermissionSetAssignments')
          .values({
            id: assignmentId,
            subjectType: 'user',
            subjectId: userId,
            permissionSetKey: user.permissionSet,
            createdAt: CREATED_AT,
            updatedAt: CREATED_AT,
          })
          .execute();
      }
    }
  },
});

export default seed;
