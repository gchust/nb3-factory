import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * Sample employee records so the module has something to show on a fresh install.
 *
 * Runs on every startup with `autoRun: true`, so it must be idempotent: each employee is matched on its unique
 * `employeeNo` and each certificate on its `(employeeId, name)`, and existing rows are never overwritten.
 */
const SEEDED_AT = new Date('2026-01-01T00:00:00.000Z');

const employees = [
  {
    employeeNo: 'E1001',
    name: '张伟',
    department: '安全环保部',
    certificates: [
      { name: '特种作业操作证', expiresAt: '2027-06-30' },
      { name: '安全生产考核合格证', expiresAt: '2026-12-31' },
    ],
  },
  {
    employeeNo: 'E1002',
    name: '李娜',
    department: '设备管理部',
    certificates: [{ name: '高处作业证', expiresAt: '2027-03-15' }],
  },
] as const;

const seed: SeedDefinition = defineSeed({
  name: '202609130002_seed_employee_records',

  async run({ query }) {
    for (const employee of employees) {
      const existing = await query
        .selectFrom('employees')
        .select(['id'])
        .where('employeeNo', '=', employee.employeeNo)
        .executeTakeFirst();

      let employeeId =
        existing?.id === undefined ? undefined : Number(existing.id);
      if (employeeId === undefined) {
        const result = await query
          .insertInto('employees')
          .values({
            name: employee.name,
            employeeNo: employee.employeeNo,
            department: employee.department,
            createdAt: SEEDED_AT,
            updatedAt: SEEDED_AT,
          })
          .execute();
        employeeId = Number(result.insertId);
      }

      for (const certificate of employee.certificates) {
        const existingCertificate = await query
          .selectFrom('employee_certificates')
          .select(['id'])
          .where('employeeId', '=', employeeId)
          .where('name', '=', certificate.name)
          .executeTakeFirst();
        if (existingCertificate) continue;

        await query
          .insertInto('employee_certificates')
          .values({
            employeeId,
            name: certificate.name,
            expiresAt: new Date(`${certificate.expiresAt}T00:00:00.000Z`),
            createdAt: SEEDED_AT,
            updatedAt: SEEDED_AT,
          })
          .execute();
      }
    }
  },
});

export default seed;
