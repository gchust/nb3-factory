import { verifyPassword } from 'better-auth/crypto';
import { describe, expect, it } from 'vitest';

import demoSeed, {
  HELPDESK_DEMO_PASSWORD,
} from '../../database/main/seeds/202610200002_helpdesk_demo_data.ts';
import { HELPDESK_SAMPLE_PASSWORD } from '../../server/tickets/sample-data.ts';

type Row = Record<string, unknown>;
type Filter = Record<string, unknown>;

class FakeRepository {
  readonly rows: Row[] = [];

  async findOne({ filter }: { filter: Filter }): Promise<Row | null> {
    return (
      this.rows.find((row) =>
        Object.entries(filter).every(([key, value]) => row[key] === value),
      ) ?? null
    );
  }

  async createOne({ values }: { values: Row }): Promise<Row> {
    const row = { ...values };
    this.rows.push(row);
    return row;
  }
}

const createSeedRun = () => {
  const tables = new Map<string, FakeRepository>();
  const repository = (name: string): FakeRepository => {
    const existing = tables.get(name);
    if (existing) return existing;
    const created = new FakeRepository();
    tables.set(name, created);
    return created;
  };
  return {
    tables,
    repository: (name: string) => repository(name),
    query: {},
    connection: {},
    container: {},
    config: {},
  };
};

describe('helpdesk demo seed', () => {
  it('is optional sample data and installs the demo once', async () => {
    expect(demoSeed.name).toBe('202610200002_helpdesk_demo_data');
    expect(demoSeed.sample).toBe(true);
    expect(demoSeed.transaction).toBe(false);
    expect(HELPDESK_DEMO_PASSWORD).toBe(HELPDESK_SAMPLE_PASSWORD);

    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    try {
      const fakeSeed = createSeedRun();
      await demoSeed.run(fakeSeed as never);

      const users = fakeSeed.repository('user').rows;
      const accounts = fakeSeed.repository('account').rows;
      const assignments = fakeSeed.repository(
        'authorizationPermissionSetAssignments',
      ).rows;
      const tickets = fakeSeed.repository('tickets').rows;
      const comments = fakeSeed.repository('ticketComments').rows;

      expect(users).toHaveLength(5);
      expect(accounts).toHaveLength(5);
      expect(assignments).toHaveLength(8);
      expect(tickets).toHaveLength(8);
      expect(comments).toHaveLength(2);
      expect(
        tickets.filter(
          (ticket) => ticket.status === 'pending' && ticket.assigneeId === null,
        ),
      ).toHaveLength(2);
      expect(new Set(tickets.map((ticket) => ticket.status))).toEqual(
        new Set([
          'pending',
          'processing',
          'escalated',
          'resolved',
          'closed',
          'cancelled',
        ]),
      );

      const alice = accounts.find(
        (account) => account.userId === 'demo-user-alice',
      );
      expect(
        await verifyPassword({
          hash: String(alice?.password),
          password: HELPDESK_DEMO_PASSWORD,
        }),
      ).toBe(true);

      await demoSeed.run(fakeSeed as never);
      expect(fakeSeed.repository('user').rows).toHaveLength(5);
      expect(fakeSeed.repository('account').rows).toHaveLength(5);
      expect(
        fakeSeed.repository('authorizationPermissionSetAssignments').rows,
      ).toHaveLength(8);
      expect(fakeSeed.repository('tickets').rows).toHaveLength(8);
      expect(fakeSeed.repository('ticketComments').rows).toHaveLength(2);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('does not create known-password accounts in production', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const fakeSeed = createSeedRun();
      await demoSeed.run(fakeSeed as never);
      expect(fakeSeed.tables.size).toBe(0);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
