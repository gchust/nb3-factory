import { describe, expect, it } from 'vitest';

import {
  AssigneeNotFoundError,
  InvalidStatusTransitionError,
  ItTicketServiceImpl,
  TicketNotFoundError,
} from '../../server/providers/index.js';
import { createDeskDatabase, seedDeskDatabase } from '../helpers/database.js';

describe('ItTicketServiceImpl', () => {
  it('lists tickets with filters, search and pagination', async () => {
    const manager = await createDeskDatabase();
    try {
      await seedDeskDatabase(manager);
      const service = new ItTicketServiceImpl(manager);

      const all = await service.list({});
      expect(all.total).toBe(12);
      expect(all.items).toHaveLength(12);
      // Newest first.
      expect(all.items[0]!.title).toBe(
        'Password reset for the customer portal',
      );

      const pending = await service.list({ status: 'pending' });
      expect(pending.total).toBe(4);
      expect(pending.items.every((t) => t.status === 'pending')).toBe(true);

      const urgent = await service.list({ priority: 'urgent' });
      expect(urgent.total).toBe(2);
      expect(urgent.items.every((t) => t.priority === 'urgent')).toBe(true);

      const network = await service.list({ category: 'network' });
      expect(network.total).toBe(3);

      const search = await service.list({ search: 'printer' });
      expect(search.total).toBe(1);
      expect(search.items[0]!.title).toContain('Printer');

      const page = await service.list({ page: 2, pageSize: 5 });
      expect(page.items).toHaveLength(5);
      expect(page.page).toBe(2);
      expect(page.pageSize).toBe(5);
      expect(page.total).toBe(12);

      const capped = await service.list({ pageSize: 500 });
      expect(capped.pageSize).toBe(100);
    } finally {
      await manager.destroy();
    }
  });

  it('joins requester and assignee display names', async () => {
    const manager = await createDeskDatabase();
    try {
      await seedDeskDatabase(manager);
      const service = new ItTicketServiceImpl(manager);

      const ticket = await service.getById(1);
      expect(ticket.requesterName).toBe('Fang Wang');
      expect(ticket.assigneeName).toBe('Wei Zhang');
      expect(ticket.requesterId).not.toBe('');
    } finally {
      await manager.destroy();
    }
  });

  it('throws TicketNotFoundError for a missing ticket', async () => {
    const manager = await createDeskDatabase();
    try {
      await seedDeskDatabase(manager);
      const service = new ItTicketServiceImpl(manager);

      await expect(service.getById(9999)).rejects.toBeInstanceOf(
        TicketNotFoundError,
      );
    } finally {
      await manager.destroy();
    }
  });

  it('creates a pending ticket for the requester', async () => {
    const manager = await createDeskDatabase();
    try {
      await seedDeskDatabase(manager);
      const service = new ItTicketServiceImpl(manager);

      const requester = await manager
        .query()
        .selectFrom('user')
        .select('id')
        .where('email', '=', 'zhang.wei@example.com')
        .executeTakeFirst();

      const created = await service.create(
        {
          title: 'New keyboard needed',
          description: 'The current keyboard has several dead keys.',
          category: 'hardware',
          priority: 'normal',
        },
        String(requester!.id),
      );

      expect(created.id).toBeGreaterThan(0);
      expect(created.status).toBe('pending');
      expect(created.requesterId).toBe(String(requester!.id));
      expect(created.assigneeId).toBeNull();
      expect(created.resolution).toBeNull();
      expect(created.requesterName).toBe('Wei Zhang');

      const total = await service.list({});
      expect(total.total).toBe(13);
    } finally {
      await manager.destroy();
    }
  });

  it('updates fields and follows the status lifecycle', async () => {
    const manager = await createDeskDatabase();
    try {
      await seedDeskDatabase(manager);
      const service = new ItTicketServiceImpl(manager);

      // pending -> inProgress -> resolved -> closed -> pending
      const started = await service.update(2, { status: 'inProgress' });
      expect(started.status).toBe('inProgress');

      const resolved = await service.update(2, {
        status: 'resolved',
        resolution: 'Replaced the access point.',
      });
      expect(resolved.status).toBe('resolved');
      expect(resolved.resolution).toBe('Replaced the access point.');

      const closed = await service.update(2, { status: 'closed' });
      expect(closed.status).toBe('closed');

      const reopened = await service.update(2, { status: 'pending' });
      expect(reopened.status).toBe('pending');

      // Editing title and assignee together.
      const assignee = await manager
        .query()
        .selectFrom('user')
        .select('id')
        .where('email', '=', 'li.na@example.com')
        .executeTakeFirst();
      const edited = await service.update(2, {
        title: 'Cannot connect to the office Wi-Fi (updated)',
        assigneeId: String(assignee!.id),
      });
      expect(edited.title).toBe('Cannot connect to the office Wi-Fi (updated)');
      expect(edited.assigneeName).toBe('Na Li');
    } finally {
      await manager.destroy();
    }
  });

  it('rejects invalid status transitions', async () => {
    const manager = await createDeskDatabase();
    try {
      await seedDeskDatabase(manager);
      const service = new ItTicketServiceImpl(manager);

      // Ticket 2 is pending; pending cannot jump straight to resolved.
      await expect(
        service.update(2, { status: 'resolved' }),
      ).rejects.toBeInstanceOf(InvalidStatusTransitionError);
    } finally {
      await manager.destroy();
    }
  });

  it('rejects an unknown assignee', async () => {
    const manager = await createDeskDatabase();
    try {
      await seedDeskDatabase(manager);
      const service = new ItTicketServiceImpl(manager);

      await expect(
        service.update(2, { assigneeId: 'no-such-user' }),
      ).rejects.toBeInstanceOf(AssigneeNotFoundError);
    } finally {
      await manager.destroy();
    }
  });

  it('lists assignee candidates from the user table', async () => {
    const manager = await createDeskDatabase();
    try {
      await seedDeskDatabase(manager);
      const service = new ItTicketServiceImpl(manager);

      const candidates = await service.assigneeCandidates();
      expect(candidates).toHaveLength(5);
      expect(candidates[0]!.name).toBe('Fang Wang');
      expect(candidates.every((c) => c.email.endsWith('@example.com'))).toBe(
        true,
      );
    } finally {
      await manager.destroy();
    }
  });
});
