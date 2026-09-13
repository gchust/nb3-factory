// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';

import migration from '../../database/main/migrations/202609130001_create_employee_records.js';
import seed from '../../database/main/seeds/202609130002_seed_employee_records.js';
import {
  createEmployeeRecordsService,
  EMPLOYEE_FILE_COLLECTION,
} from '../../server/providers/employee-records.js';

let directory: string;
let filename: string;
let database: DatabaseManager;

async function migrate(manager: DatabaseManager): Promise<void> {
  await manager.connect('main');
  await migration.up({
    builder: manager.builder('main'),
    query: manager.query('main'),
    connection: manager.connection('main'),
  });
}

function createManager(file: string): DatabaseManager {
  return createDatabaseManager({
    default: 'main',
    connections: { main: { dialect: 'sqlite', filename: file } },
  });
}

async function insertAttachment(
  manager: DatabaseManager,
  values: { id: string; filename: string; ext: string },
): Promise<void> {
  const now = new Date();
  await manager
    .query()
    .insertInto(EMPLOYEE_FILE_COLLECTION)
    .values({
      id: values.id,
      disk: 'local',
      key: `objects/${values.id}.${values.ext}`,
      filename: values.filename,
      ext: values.ext,
      mimeType: 'text/plain',
      size: 12,
      createdAt: now,
      updatedAt: now,
      certificateId: null,
    })
    .execute();
}

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'employee-records-'));
  filename = join(directory, 'database.sqlite');
  database = createManager(filename);
  await migrate(database);
});

afterEach(async () => {
  await database.destroy();
  rmSync(directory, { recursive: true, force: true });
});

describe('employee records schema', () => {
  it('creates the tables and rejects a duplicate employee number', async () => {
    const query = database.query();
    await query
      .insertInto('employees')
      .values({
        name: 'A',
        employeeNo: 'E1',
        department: 'Ops',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .execute();

    await expect(
      query
        .insertInto('employees')
        .values({
          name: 'B',
          employeeNo: 'E1',
          department: 'Ops',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .execute(),
    ).rejects.toThrow(/unique/i);
  });

  it('reverses the migration', async () => {
    await migration.down({
      builder: database.builder('main'),
      query: database.query('main'),
      connection: database.connection('main'),
    });

    const rows = await database
      .query()
      .selectFrom('sqlite_master')
      .select(['name'])
      .where('name', 'in', [
        'employees',
        'employee_certificates',
        'employee_certificate_files',
      ])
      .execute();
    expect(rows).toHaveLength(0);
  });
});

describe('employee records service', () => {
  it('creates employees and reads them back', async () => {
    const service = createEmployeeRecordsService(database);
    const employee = await service.createEmployee({
      name: '张三',
      employeeNo: 'E2001',
      department: '工程部',
    });

    expect(employee.id).toBeGreaterThan(0);
    await expect(service.getEmployee(employee.id)).resolves.toMatchObject({
      name: '张三',
      employeeNo: 'E2001',
      department: '工程部',
    });
    expect(await service.listEmployees()).toHaveLength(1);
    await expect(service.getEmployee(9999)).resolves.toBeUndefined();
  });

  it('links attachments to a certificate and returns them with the certificate', async () => {
    const service = createEmployeeRecordsService(database);
    const employee = await service.createEmployee({
      name: '李四',
      employeeNo: 'E2002',
      department: '安全部',
    });
    const fileId = '11111111-1111-4111-8111-111111111111';
    await insertAttachment(database, {
      id: fileId,
      filename: 'permit.txt',
      ext: 'txt',
    });

    const certificate = await service.createCertificate(employee.id, {
      name: '特种作业证',
      expiresAt: '2027-05-31',
      fileIds: [fileId],
    });

    expect(certificate).toBeDefined();
    expect(certificate?.expiresAt).toBe('2027-05-31T00:00:00.000Z');
    expect(certificate?.attachments).toEqual([
      expect.objectContaining({
        id: fileId,
        filename: 'permit.txt',
        ext: 'txt',
        size: 12,
      }),
    ]);

    const listed = await service.listCertificates(employee.id);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.attachments[0]?.id).toBe(fileId);
  });

  it('returns undefined when the employee does not exist', async () => {
    const service = createEmployeeRecordsService(database);
    await expect(
      service.createCertificate(4242, { name: '无主证件' }),
    ).resolves.toBeUndefined();
  });

  it('deletes a certificate and its attachment metadata', async () => {
    const service = createEmployeeRecordsService(database);
    const employee = await service.createEmployee({
      name: '王五',
      employeeNo: 'E2003',
      department: '设备部',
    });
    const fileId = '22222222-2222-4222-8222-222222222222';
    await insertAttachment(database, {
      id: fileId,
      filename: 'scan.txt',
      ext: 'txt',
    });
    const certificate = await service.createCertificate(employee.id, {
      name: '高处作业证',
      fileIds: [fileId],
    });
    expect(certificate).toBeDefined();

    await expect(service.deleteCertificate(certificate!.id)).resolves.toBe(
      true,
    );
    await expect(service.deleteCertificate(certificate!.id)).resolves.toBe(
      false,
    );
    expect(await service.listCertificates(employee.id)).toHaveLength(0);
    const files = await database
      .query()
      .selectFrom(EMPLOYEE_FILE_COLLECTION)
      .select(['id'])
      .execute();
    expect(files).toHaveLength(0);
  });

  it('keeps records across a reconnect to the same database', async () => {
    const service = createEmployeeRecordsService(database);
    const employee = await service.createEmployee({
      name: '赵六',
      employeeNo: 'E2004',
      department: '生产部',
    });
    const fileId = '33333333-3333-4333-8333-333333333333';
    await insertAttachment(database, {
      id: fileId,
      filename: 'id.txt',
      ext: 'txt',
    });
    await service.createCertificate(employee.id, {
      name: '上岗证',
      expiresAt: '2028-01-01',
      fileIds: [fileId],
    });

    await database.destroy();
    database = createManager(filename);
    await database.connect('main');

    const reopened = createEmployeeRecordsService(database);
    const employees = await reopened.listEmployees();
    expect(employees).toHaveLength(1);
    const certificates = await reopened.listCertificates(employees[0]!.id);
    expect(certificates).toHaveLength(1);
    expect(certificates[0]?.attachments[0]?.filename).toBe('id.txt');
    expect(certificates[0]?.expiresAt).toBe('2028-01-01T00:00:00.000Z');
  });
});

describe('employee records seed', () => {
  it('inserts sample data once and is idempotent', async () => {
    const context = {
      query: database.query('main'),
      connection: database.connection('main'),
    };
    await seed.run(context);
    await seed.run(context);

    const employees = await database
      .query()
      .selectFrom('employees')
      .select(['employeeNo'])
      .orderBy('employeeNo', 'asc')
      .execute();
    expect(employees.map((row) => row.employeeNo)).toEqual(['E1001', 'E1002']);

    const certificates = await database
      .query()
      .selectFrom('employee_certificates')
      .select(['id'])
      .execute();
    expect(certificates).toHaveLength(3);
  });
});
