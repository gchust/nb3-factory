# Server conventions (application-owned)

This file documents additions this application made on top of the template. The
template's root `AGENTS.md` is template-owned and is replaced on upgrade; keep
application notes here.

## HR module

The HR feature is a vertical slice, not a plugin:

- `database/main/migrations/20261101000{1..4}_create_hr_*.ts` define
  `hrDepartments`, `hrEmployees`, `hrLeaveRequests` and `hrNotifications`.
  `hrNotifications` is append-only and has no `updatedAt`.
- `server/hr/types.ts` holds the row/view shapes; `server/hr/service.ts` holds
  all domain logic and is resolved through the `hrServiceToken` bound in
  `server/providers/hr.ts`; `server/routes/hr.ts` is the HTTP surface
  (`/api/hr/*`, declared with `describeRoute` + `apiValidator`) and
  `server/routes/schemas.ts` the zod schemas.
- `server/hr/resources.ts` declares the authorization vocabulary once: the
  `hr.portal` composite resource with its camelCase actions, and the
  `hr-hr` / `hr-supervisor` / `hr-employee` permission sets. `server/providers/hr.ts`
  registers the composite, places it in the permission workspace, and
  provisions the permission sets, departments, accounts, sample leave requests
  and notifications at runtime. Permission sets are **not** seeds.

### Two rules that are easy to get wrong

1. **Gate a composite action with `context.can()`, not `require()`.**
   Composing a composite always yields a `conditional` decision because its
   underlying database checks carry a row scope, and `require` accepts only
   `permit`. `can` performs the action-level check; the service then applies the
   row scope and field confidentiality by deriving the actor's role in
   `HrService.resolveActor()` from `authz.permissionSets.getEffective()` keys
   (`hr-hr` / `hr-supervisor`) and from the employee record matched by `userId`.
   Every HR route also installs `auth.required()`.
2. **NocoBase 3 does not fill `createdAt`/`updatedAt`.** Spread
   `createStamp()`/`updateStamp()`/`createdStamp()` from `server/hr/service.ts`
   into every create/update. A create without them fails on the NOT NULL
   columns.

Store the deployment base path nowhere in these files; the runtime restores it.
