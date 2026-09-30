import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Service tickets, their audit trail and the operation journal used to make
 * acceptance and external submissions idempotent. The operation table carries a
 * unique idempotency key so a repeated request never advances the ticket twice.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609100002_create_service_tickets',
  async up({ builder }) {
    await builder.createCollection(
      'serviceTickets',
      (collection) => {
        collection.increments('id');
        collection.string('code', { length: 64, nullable: false });
        collection.string('title', { length: 255, nullable: false });
        collection.text('description');
        // pending_acceptance -> pending_processing -> processing ->
        // pending_confirmation -> closed
        collection.string('status', {
          length: 32,
          nullable: false,
          defaultValue: 'pending_acceptance',
        });
        collection.string('priority', {
          length: 32,
          nullable: false,
          defaultValue: 'normal',
        });
        collection.string('source', {
          length: 32,
          nullable: false,
          defaultValue: 'manual',
        });
        collection.boolean('confidential', {
          nullable: false,
          defaultValue: false,
        });
        collection.string('reporterName', { length: 255 });
        collection.text('resolution');
        collection.datetime('acceptedAt');
        collection.datetime('startedAt');
        collection.datetime('submittedAt');
        collection.datetime('closedAt');
        collection.datetime('dueAt');
        // pending -> processing -> succeeded | failed
        collection.string('acceptanceStatus', {
          length: 32,
          nullable: false,
          defaultValue: 'pending',
        });
        collection.text('acceptanceError');
        collection.datetime('acceptanceHandledAt');
        // Idempotency for the external device platform: one repair event per
        // external event number.
        collection.string('externalEventId', { length: 128 });
        collection.string('externalPlatform', { length: 64 });
        collection.string('createdById', { length: 64 });
        collection.string('assigneeId', { length: 64 });
        collection.datetime('createdAt', { nullable: false });
        collection.datetime('updatedAt', { nullable: false });
        collection.unique('code', { name: 'service_tickets_code_unique' });
        collection.unique('externalEventId', {
          name: 'service_tickets_external_event_unique',
        });
        collection.index('status', { name: 'service_tickets_status_idx' });
        collection.index('assigneeId', {
          name: 'service_tickets_assignee_idx',
        });
        collection.index('confidential', {
          name: 'service_tickets_confidential_idx',
        });
        collection
          .belongsTo('customer', 'serviceCustomers')
          .foreignKey('customerId')
          .foreignKeyType('integer')
          .targetKey('id')
          .constraints(true)
          .onDelete('restrict');
        collection
          .belongsTo('device', 'serviceDevices')
          .foreignKey('deviceId')
          .foreignKeyType('integer')
          .targetKey('id')
          .constraints(true)
          .onDelete('restrict');
        collection.index('customerId', {
          name: 'service_tickets_customer_idx',
        });
        collection.index('deviceId', {
          name: 'service_tickets_device_idx',
        });
      },
      { ifNotExists: true },
    );

    await builder.createCollection(
      'serviceTicketEvents',
      (collection) => {
        collection.increments('id');
        collection.string('type', { length: 64, nullable: false });
        collection.string('fromStatus', { length: 32 });
        collection.string('toStatus', { length: 32 });
        collection.text('message');
        collection.string('actorId', { length: 64 });
        collection.json('data');
        collection.datetime('createdAt', { nullable: false });
        collection
          .belongsTo('ticket', 'serviceTickets')
          .foreignKey('ticketId')
          .foreignKeyType('integer')
          .targetKey('id')
          .constraints(true)
          .onDelete('cascade');
        collection.index('ticketId', {
          name: 'service_ticket_events_ticket_idx',
        });
        collection.index('type', {
          name: 'service_ticket_events_type_idx',
        });
      },
      { ifNotExists: true },
    );

    await builder.createCollection(
      'serviceTicketOperations',
      (collection) => {
        collection.increments('id');
        collection.string('idempotencyKey', {
          length: 255,
          nullable: false,
        });
        collection.string('type', { length: 64, nullable: false });
        // running -> succeeded | failed
        collection.string('status', {
          length: 32,
          nullable: false,
          defaultValue: 'running',
        });
        collection.text('error');
        collection.json('result');
        collection.datetime('createdAt', { nullable: false });
        collection.datetime('updatedAt', { nullable: false });
        collection.unique('idempotencyKey', {
          name: 'service_ticket_operations_key_unique',
        });
        collection
          .belongsTo('ticket', 'serviceTickets')
          .foreignKey('ticketId')
          .foreignKeyType('integer')
          .targetKey('id')
          .constraints(true)
          .onDelete('cascade');
        collection.index('ticketId', {
          name: 'service_ticket_operations_ticket_idx',
        });
      },
      { ifNotExists: true },
    );
  },
  async down({ builder }) {
    await builder.dropCollection('serviceTicketOperations');
    await builder.dropCollection('serviceTicketEvents');
    await builder.dropCollection('serviceTickets');
  },
});

export default migration;
