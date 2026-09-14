import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createRecruitingTestDatabase,
  rawRows,
  type RecruitingTestDatabase,
} from './recruiting-test-database.js';

const TABLES = [
  'recruiting_requisitions',
  'recruiting_candidates',
  'recruiting_interviews',
  'recruiting_evaluations',
  'recruiting_offers',
  'recruiting_resumes',
];

describe('recruiting migration', () => {
  let database: RecruitingTestDatabase;

  beforeAll(async () => {
    database = await createRecruitingTestDatabase();
  });

  afterAll(async () => {
    await database.teardown();
  });

  it('creates every recruiting table', async () => {
    const rows = await rawRows(
      database.connection,
      "select name from sqlite_master where type = 'table' and name like 'recruiting_%'",
    );
    const names = rows.map((row) => String(row.name)).sort();
    expect(names).toEqual([...TABLES].sort());
  });

  it('declares the candidate columns and constraints', async () => {
    const columns = (
      await rawRows(
        database.connection,
        'pragma table_info(recruiting_candidates)',
      )
    ).map((row) => String(row.name));
    expect(columns).toEqual(
      expect.arrayContaining([
        'id',
        'name',
        'phone',
        'email',
        'requisition_id',
        'source',
        'stage',
        'overall_score',
        'resume_file_id',
        'resume_filename',
        'created_at',
        'updated_at',
      ]),
    );
  });

  it('enforces one offer per candidate at the database level', async () => {
    const indexes = await rawRows(
      database.connection,
      'pragma index_list(recruiting_offers)',
    );
    expect(indexes.some((row) => Number(row.unique) === 1)).toBe(true);

    const now = new Date().toISOString();
    await rawRows(
      database.connection,
      'insert into recruiting_offers (candidate_id, position, status, created_at, updated_at) values (?, ?, ?, ?, ?)',
      [1, 'Engineer', 'pending', now, now],
    );

    await expect(
      rawRows(
        database.connection,
        'insert into recruiting_offers (candidate_id, position, status, created_at, updated_at) values (?, ?, ?, ?, ?)',
        [1, 'Engineer', 'pending', now, now],
      ),
    ).rejects.toThrow();
  });

  it('enforces one evaluation per interview', async () => {
    const now = new Date().toISOString();
    await rawRows(
      database.connection,
      'insert into recruiting_evaluations (interview_id, technical_score, communication_score, conclusion, created_at, updated_at) values (?, ?, ?, ?, ?, ?)',
      [99, 4, 4, 'pass', now, now],
    );

    await expect(
      rawRows(
        database.connection,
        'insert into recruiting_evaluations (interview_id, technical_score, communication_score, conclusion, created_at, updated_at) values (?, ?, ?, ?, ?, ?)',
        [99, 1, 1, 'fail', now, now],
      ),
    ).rejects.toThrow();
  });

  it('reverses itself when rolled back', async () => {
    const fresh = await createRecruitingTestDatabase();
    await fresh.rollback();

    const tables = await rawRows(
      fresh.connection,
      "select name from sqlite_master where type = 'table' and name like 'recruiting_%'",
    );
    expect(tables).toHaveLength(0);
    await fresh.teardown();
  });
});
