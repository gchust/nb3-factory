import { describe, expect, it } from 'vitest';

import type { DatabaseManager, QueryAdapter } from '@nocobase/db';
import {
  DocumentAccessError,
  DocumentsService,
  type DocumentPrincipal,
} from '../../server/providers/documents.js';

type Row = Record<string, unknown>;
type Condition = { field: string; op: '=' | 'in'; value: unknown };

class FakeSelect {
  private readonly conditions: Condition[] = [];
  private order: { field: string; direction: 'asc' | 'desc' } | null = null;

  constructor(private readonly rows: Row[]) {}

  select(): this {
    return this;
  }

  where(field: string, op: '=' | 'in', value: unknown): this {
    this.conditions.push({ field, op, value });
    return this;
  }

  orderBy(field: string, direction: 'asc' | 'desc'): this {
    this.order = { field, direction };
    return this;
  }

  private matched(): Row[] {
    const selected = this.rows.filter((row) =>
      this.conditions.every((condition) =>
        condition.op === '='
          ? row[condition.field] === condition.value
          : (condition.value as unknown[]).includes(row[condition.field]),
      ),
    );
    if (!this.order) {
      return selected.map((row) => ({ ...row }));
    }
    const { field, direction } = this.order;
    return [...selected]
      .sort((left, right) => {
        const a = left[field] as string | number;
        const b = right[field] as string | number;
        if (a === b) return 0;
        return (a < b ? -1 : 1) * (direction === 'asc' ? 1 : -1);
      })
      .map((row) => ({ ...row }));
  }

  execute(): Promise<Row[]> {
    return Promise.resolve(this.matched());
  }

  executeTakeFirst(): Promise<Row | undefined> {
    return Promise.resolve(this.matched()[0]);
  }
}

class FakeInsert {
  private rows: Row[] = [];

  constructor(private readonly table: Row[]) {}

  values(data: Row): this {
    this.rows.push({ ...data });
    return this;
  }

  execute(): Promise<{ insertedCount: number }> {
    this.table.push(...this.rows);
    return Promise.resolve({ insertedCount: this.rows.length });
  }
}

class FakeUpdate {
  private changes: Row = {};
  private readonly conditions: Condition[] = [];

  constructor(private readonly table: Row[]) {}

  set(changes: Row): this {
    this.changes = { ...this.changes, ...changes };
    return this;
  }

  where(field: string, op: '=' | 'in', value: unknown): this {
    this.conditions.push({ field, op, value });
    return this;
  }

  execute(): Promise<{ updatedCount: number }> {
    let updatedCount = 0;
    for (const row of this.table) {
      const matches = this.conditions.every((condition) =>
        condition.op === '='
          ? row[condition.field] === condition.value
          : (condition.value as unknown[]).includes(row[condition.field]),
      );
      if (matches) {
        Object.assign(row, this.changes);
        updatedCount += 1;
      }
    }
    return Promise.resolve({ updatedCount });
  }
}

class FakeQuery {
  constructor(private readonly tables: Record<string, Row[]>) {}

  private table(name: string): Row[] {
    this.tables[name] ??= [];
    return this.tables[name];
  }

  selectFrom(name: string): FakeSelect {
    return new FakeSelect(this.table(name));
  }

  insertInto(name: string): FakeInsert {
    return new FakeInsert(this.table(name));
  }

  updateTable(name: string): FakeUpdate {
    return new FakeUpdate(this.table(name));
  }
}

const now = new Date('2026-10-03T00:00:00.000Z');

function createService(): {
  service: DocumentsService;
  tables: Record<string, Row[]>;
} {
  const tables: Record<string, Row[]> = {
    documents: [
      {
        id: 'a',
        title: 'A',
        content: '蓝鹭设备报修电话为 400-000-7316。',
        accessLevel: 'public',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'b',
        title: 'B',
        content: '蓝鹭设备常规巡检间隔为 45 天。',
        accessLevel: 'public',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'c',
        title: 'C',
        content: '保密项目的内部代号为墨竹 729。',
        accessLevel: 'supervisor',
        createdAt: now,
        updatedAt: now,
      },
    ],
    authorizationPermissionSetAssignments: [
      {
        subjectType: 'user',
        subjectId: 'supervisor-1',
        permissionSetKey: 'supervisor',
      },
      {
        subjectType: 'user',
        subjectId: 'root-1',
        permissionSetKey: 'root',
      },
    ],
  };
  const database = {
    query: () => new FakeQuery(tables) as unknown as QueryAdapter,
  } as unknown as DatabaseManager;
  return { service: new DocumentsService(database, '/main'), tables };
}

const colleague: DocumentPrincipal = { userId: 'colleague-1', isRoot: false };
const supervisor: DocumentPrincipal = { userId: 'supervisor-1', isRoot: false };

describe('DocumentsService', () => {
  it('lists only public documents for a colleague and marks them read-only', async () => {
    const { service } = createService();
    const result = await service.list(colleague);
    expect(result.canManage).toBe(false);
    expect(result.documents.map((document) => document.id)).toEqual(['a', 'b']);
  });

  it('lists every document for a supervisor and marks them manageable', async () => {
    const { service } = createService();
    const result = await service.list(supervisor);
    expect(result.canManage).toBe(true);
    expect(result.documents.map((document) => document.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('refuses a colleague a restricted document with 403 but allows a public one', async () => {
    const { service } = createService();
    await expect(service.get(colleague, 'c')).rejects.toMatchObject({
      name: 'DocumentAccessError',
      status: 403,
    });
    await expect(service.get(colleague, 'a')).resolves.toMatchObject({
      id: 'a',
    });
  });

  it('returns 404 for an unknown document and builds an openable link', async () => {
    const { service } = createService();
    await expect(service.get(supervisor, 'missing')).rejects.toBeInstanceOf(
      DocumentAccessError,
    );
    const document = await service.get(supervisor, 'c');
    expect(document.link).toBe('/main/documents?doc=c');
  });

  it('refuses a colleague writes and lets a supervisor create and update', async () => {
    const { service } = createService();
    await expect(
      service.create(colleague, { title: 'x', content: 'y' }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.update(colleague, 'c', { content: 'hacked' }),
    ).rejects.toMatchObject({ status: 403 });

    const created = await service.create(supervisor, {
      title: 'D',
      content: 'new',
      accessLevel: 'public',
    });
    expect(created.title).toBe('D');

    const updated = await service.update(supervisor, 'b', {
      content: '蓝鹭设备常规巡检间隔为 60 天。',
    });
    expect(updated.content).toContain('60 天');
  });

  it('never lets a colleague search restricted content', async () => {
    const { service } = createService();
    const colleagueMatches = await service.search(colleague, '墨竹');
    expect(colleagueMatches).toEqual([]);

    const supervisorMatches = await service.search(supervisor, '墨竹');
    expect(supervisorMatches.map((document) => document.id)).toEqual(['c']);

    const phoneMatches = await service.search(colleague, '400-000-7316');
    expect(phoneMatches.map((document) => document.id)).toEqual(['a']);
  });
});
