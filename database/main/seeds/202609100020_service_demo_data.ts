import { defineSeed } from '@nocobase/db';
import {
  demoArticles,
  demoCustomers,
  demoDevices,
  demoInspections,
  demoManuals,
  demoTickets,
} from '../../seed-data/service-demo.ts';

const DAY = 24 * 60 * 60 * 1000;

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY).toISOString();
}

/**
 * Demonstrates the whole lifecycle with real rows: customers, devices, tickets
 * in every state with their audit events, an inspection and the knowledge base.
 * Every record is matched by its business key and skipped if present, so the
 * seed can run again without duplicating anything.
 */
const seed = defineSeed({
  name: '202609100020_service_demo_data',
  async run(context) {
    const { query } = context;
    const repository = context.repository.bind(context);
    const now = new Date().toISOString();

    const customers = repository('serviceCustomers');
    const devices = repository('serviceDevices');
    const tickets = repository('serviceTickets');
    const events = repository('serviceTicketEvents');
    const inspections = repository('serviceInspections');
    const articles = repository('serviceKnowledgeArticles');
    const manuals = repository('serviceManuals');

    const userIdByUsername = new Map<string, string>();
    for (const account of await query
      .selectFrom('user')
      .select(['id', 'username'])
      .execute()) {
      userIdByUsername.set(String(account.username), String(account.id));
    }
    const supervisorId = userIdByUsername.get('supervisor') ?? null;

    const customerIdByCode = new Map<string, number>();
    for (const customer of demoCustomers) {
      const existing = await customers.findOne({
        filter: { code: customer.code },
        select: (select) => select.fields('id'),
      });
      if (existing) {
        customerIdByCode.set(customer.code, Number(existing.id));
        continue;
      }
      const created = await customers.createOne({
        values: {
          ...customer,
          ownerId: supervisorId,
          createdAt: now,
          updatedAt: now,
        },
        select: (select) => select.fields('id'),
      });
      customerIdByCode.set(customer.code, Number(created.record.id));
    }

    const deviceIdBySerial = new Map<string, number>();
    for (const device of demoDevices) {
      const customerId = customerIdByCode.get(device.customerCode);
      if (!customerId) continue;
      const { customerCode: _customerCode, ...fields } = device;
      const existing = await devices.findOne({
        filter: { serialNumber: device.serialNumber },
        select: (select) => select.fields('id'),
      });
      if (existing) {
        deviceIdBySerial.set(device.serialNumber, Number(existing.id));
        continue;
      }
      const created = await devices.createOne({
        values: {
          ...fields,
          warrantyUntil: new Date(fields.warrantyUntil).toISOString(),
          customerId,
          createdAt: now,
          updatedAt: now,
        },
        select: (select) => select.fields('id'),
      });
      deviceIdBySerial.set(device.serialNumber, Number(created.record.id));
    }

    const ticketIdByCode = new Map<string, number>();
    for (const ticket of demoTickets) {
      const deviceId = deviceIdBySerial.get(ticket.deviceSerial);
      const device = demoDevices.find(
        (entry) => entry.serialNumber === ticket.deviceSerial,
      );
      const customerId = device
        ? customerIdByCode.get(device.customerCode)
        : undefined;
      if (!deviceId || !customerId) continue;
      const existing = await tickets.findOne({
        filter: { code: ticket.code },
        select: (select) => select.fields('id'),
      });
      if (existing) {
        ticketIdByCode.set(ticket.code, Number(existing.id));
        continue;
      }
      const assigneeId = ticket.assigneeUsername
        ? (userIdByUsername.get(ticket.assigneeUsername) ?? null)
        : null;
      const createdDaysAgo = Math.max(ticket.events.length - 1, 0) + 1;
      const accepted = ticket.status !== 'pending_acceptance';
      const started =
        ticket.status === 'processing' ||
        ticket.status === 'pending_confirmation' ||
        ticket.status === 'closed';
      const submitted =
        ticket.status === 'pending_confirmation' || ticket.status === 'closed';
      const closed = ticket.status === 'closed';
      const created = await tickets.createOne({
        values: {
          code: ticket.code,
          title: ticket.title,
          description: ticket.description,
          status: ticket.status,
          priority: ticket.priority,
          source: ticket.source,
          confidential: ticket.confidential,
          reporterName: ticket.reporterName,
          resolution: ticket.resolution ?? null,
          acceptanceStatus:
            ticket.status === 'pending_acceptance' ? 'pending' : 'succeeded',
          acceptanceError: null,
          acceptanceHandledAt: accepted ? daysAgo(createdDaysAgo - 1) : null,
          acceptedAt: accepted ? daysAgo(createdDaysAgo - 1) : null,
          startedAt: started ? daysAgo(createdDaysAgo - 1) : null,
          submittedAt: submitted ? daysAgo(createdDaysAgo - 2) : null,
          closedAt: closed ? daysAgo(createdDaysAgo - 3) : null,
          dueAt: daysAgo(-2),
          externalEventId: ticket.externalEventId ?? null,
          externalPlatform: ticket.externalPlatform ?? null,
          createdById: supervisorId,
          assigneeId,
          customerId,
          deviceId,
          createdAt: daysAgo(createdDaysAgo),
          updatedAt: daysAgo(1),
        },
        select: (select) => select.fields('id'),
      });
      const ticketId = Number(created.record.id);
      ticketIdByCode.set(ticket.code, ticketId);

      let index = 0;
      for (const event of ticket.events) {
        await events.createOne({
          values: {
            ticketId,
            type: event.type,
            fromStatus: event.fromStatus ?? null,
            toStatus: event.toStatus ?? null,
            message: event.message,
            actorId: index === 0 ? supervisorId : assigneeId,
            data: null,
            createdAt: daysAgo(createdDaysAgo - index),
          },
        });
        index += 1;
      }
    }

    for (const inspection of demoInspections) {
      const deviceId = deviceIdBySerial.get(inspection.deviceSerial);
      const device = demoDevices.find(
        (entry) => entry.serialNumber === inspection.deviceSerial,
      );
      const customerId = device
        ? customerIdByCode.get(device.customerCode)
        : undefined;
      if (!deviceId || !customerId) continue;
      const existing = await inspections.findOne({
        filter: { code: inspection.code },
        select: (select) => select.fields('id'),
      });
      if (existing) continue;
      await inspections.createOne({
        values: {
          code: inspection.code,
          title: inspection.title,
          scheduledDate: new Date(inspection.scheduledDate).toISOString(),
          status: inspection.status,
          result: null,
          findings: inspection.findings,
          completedAt: null,
          remindedAt: null,
          createdById: supervisorId,
          assigneeId: userIdByUsername.get(inspection.assigneeUsername) ?? null,
          customerId,
          deviceId,
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    for (const article of demoArticles) {
      const existing = await articles.findOne({
        filter: { slug: article.slug },
        select: (select) => select.fields('id'),
      });
      if (existing) continue;
      await articles.createOne({
        values: {
          title: article.title,
          slug: article.slug,
          category: article.category,
          deviceCategory: article.deviceCategory,
          summary: article.summary,
          content: article.content,
          status: article.status,
          tags: [...article.tags],
          viewCount: 0,
          authorId: supervisorId,
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    for (const manual of demoManuals) {
      const existing = await manuals.findOne({
        filter: { code: manual.code },
        select: (select) => select.fields('id'),
      });
      if (existing) continue;
      await manuals.createOne({
        values: {
          title: manual.title,
          code: manual.code,
          deviceCategory: manual.deviceCategory,
          model: manual.model,
          version: manual.version,
          summary: manual.summary,
          content: manual.content,
          status: manual.status,
          fileId: null,
          knowledgeBaseKey: null,
          indexStatus: 'not_indexed',
          indexError: null,
          viewCount: 0,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
  },
});

export default seed;
