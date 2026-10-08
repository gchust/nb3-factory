# Database — 设备售后服务与巡检协同系统

- `main/migrations/202610010001_equipment_service_core.ts` — customers,
  devices, tickets, inspections, knowledge_articles, ticket_shares,
  ticket_files, acceptance_logs, overdue_reminders.
- `...02` adds `tickets.observer_visible` and its index (the supervisor flag
  that decides whether a non-confidential ticket is visible to observers).
- `...03` `service_messages`, `...04` `manuals`, `...05` `assistant_messages`.
- `main/seeds/202610010010_service_test_data.ts` — permission sets, demo
  accounts, and the example business data.

Migrations are immutable history: spell out every field/index in the migration,
never import a live collection definition, and write `down` as the explicit
reverse. Data the application needs to run is a seed; seeds never create
structure.

The seed is idempotent and re-runnable. It creates development demo accounts
(`svc.supervisor`, `svc.engineer.a`, `svc.engineer.b`, `svc.observer`,
`svc.integration`) whose password must not survive into a production install
unchanged.
