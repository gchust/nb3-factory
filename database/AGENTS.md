# Database (IT service desk)

Schema changes are immutable migrations under `database/main/migrations/`. Business seeds under `database/main/seeds/` start empty; example data for the service desk is registered on `sampleDataToken` from `server/providers/it-tickets/sample-data.ts` instead, because it has to go through the users plugin and the ticket service.

- `202610100001_create_it_tickets.ts` creates `itTickets`, `itTicketRecords`, `itTicketFiles`, and `itTeamMembers`. It spells out every field, index, and constraint and never imports a collection definition, so it keeps its meaning after the definitions evolve. `down()` reverses it in dependency order.
- `database/main/collections/` is derived; regenerate it (`pnpm nocobase collections generate`) rather than editing it.
- The app has no automatic timestamps: the service sets `createdAt` / `updatedAt` explicitly on every write.
