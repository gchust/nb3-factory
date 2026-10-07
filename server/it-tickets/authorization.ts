import {
  defineDatabasePermission,
  recordAccess,
} from '@nocobase/app-plugin-authorization/server';
import { condition } from '@nocobase/app-plugin-authorization/server';
import {
  defineRecordAccess,
  defineCompositeResource,
  type AuthorizationTitle,
} from '@nocobase/authorization/core';
import { APP_NS } from '@nocobase/i18n';
import { IT_TICKETS_COLLECTION, type ItTicketRow } from './ticket.js';

/**
 * The authorization declaration of the IT repair ticketing feature.
 *
 * This module is the single source of truth for what the feature protects, and
 * it is deliberately free of any service or database handle: the provider that
 * boots the application registers what it builds, and the seed that an
 * installation runs writes a Permission Set that names the same collection,
 * record access and actions. The seed spells those keys out rather than
 * importing them, because a stored grant is history and must keep meaning what
 * it meant, but it may name nothing this module has not declared.
 */

/** The page id the client route declares in `authz`. */
export const IT_TICKETS_PAGE_ID = 'itTickets';

/** The record access that selects the tickets a principal submitted itself. */
export const SUBMITTED_BY_ME = 'it-tickets.submittedByMe';

/** The Permission Sets this feature ships. */
export const IT_TICKET_EMPLOYEE_SET = 'it-ticket-employee';
export const IT_TICKET_HANDLER_SET = 'it-ticket-handler';

/**
 * Every wording this declaration contributes to the permission editor is a
 * translation key rather than a literal, so a rule stored once reads correctly
 * in either language. `APP_NS` resolves to the application's own locale files.
 *
 * Keep these keys in step with `client/locales/en-US.ts` and `zh-CN.ts`: the
 * authorization plugin renders them through `localizedText`, and a key that is
 * missing shows up as the key itself.
 */
const label = (key: string): AuthorizationTitle => ({ key, ns: APP_NS });

/**
 * The built-in owner rule cannot be reused: `recordsIOwn` declares
 * `requiredFields: ['ownerId']` and `itTickets` has no such column, so the
 * database adapter never offers it. This rule says the same thing about the
 * column this Collection actually has.
 */
export const submittedByMe = defineRecordAccess(SUBMITTED_BY_ME, (access) =>
  access
    .title(label('itTickets.authz.recordAccess.title'))
    .description(label('itTickets.authz.recordAccess.description'))
    .collections(IT_TICKETS_COLLECTION)
    .resolver(({ principal }) => condition('submitterId', '$eq', principal.id)),
);

const submittedByMeRef = submittedByMe.reference();
const allRecordsRef = recordAccess.allRecords;

/**
 * `view`: reading tickets. Employees hold the `submittedByMe` default, so the
 * scope of the read is resolved into the SQL the Repository runs and a ticket
 * that is not theirs is not returned at all - a direct link to one answers 404,
 * not 403, because the row is invisible rather than forbidden.
 */
const viewPermission = defineDatabasePermission((permission) =>
  permission
    .collection<ItTicketRow>(IT_TICKETS_COLLECTION)
    .title(label('itTickets.authz.action.view'))
    .read((read) => read.allFields()),
)
  .options(allRecordsRef, submittedByMeRef)
  .default(submittedByMeRef);

/**
 * `create`: submitting a ticket. A create carries no record scope - the row
 * does not exist yet - so what an administrator can choose here is only which
 * Record Access the action is *described* by; the server writes `submitterId`
 * from the session and never from the request body.
 */
const createPermission = defineDatabasePermission((permission) =>
  permission
    .collection<ItTicketRow>(IT_TICKETS_COLLECTION)
    .title(label('itTickets.authz.action.create'))
    // Creating returns the created row, which the Repository reads back under
    // the read node of the same Policy; without it the write would be refused
    // as `READ_FORBIDDEN`. The read shares the action's data scope, so an
    // employee can only read back their own submission.
    .read((read) => read.allFields())
    .create((create) => create.allFields()),
)
  .options(allRecordsRef, submittedByMeRef)
  .default(submittedByMeRef);

/**
 * `start`: moving a ticket from pending to processing. The field allowlist is
 * the write policy the Repository enforces, so this action cannot change a
 * title, a category or a resolution note even if a route tried to.
 */
const startPermission = defineDatabasePermission((permission) =>
  permission
    .collection<ItTicketRow>(IT_TICKETS_COLLECTION)
    .title(label('itTickets.authz.action.start'))
    // The transition reads the ticket before deciding, and `updateOne` reads
    // the updated row back; both use the read node of the same Policy.
    .read((read) => read.allFields())
    .update((update) =>
      update.fields(
        'status',
        'handlerId',
        'handlerName',
        'startedAt',
        'updatedAt',
      ),
    ),
)
  .options(allRecordsRef, submittedByMeRef)
  .default(allRecordsRef);

/** `complete`: recording the resolution that closes a ticket. */
const completePermission = defineDatabasePermission((permission) =>
  permission
    .collection<ItTicketRow>(IT_TICKETS_COLLECTION)
    .title(label('itTickets.authz.action.complete'))
    .read((read) => read.allFields())
    .update((update) =>
      update.fields('status', 'resolutionNote', 'completedAt', 'updatedAt'),
    ),
)
  .options(allRecordsRef, submittedByMeRef)
  .default(allRecordsRef);

/**
 * The composite every route authorizes against. One action per business
 * operation, each carrying one data scope named `tickets`, whose value is the
 * Record Access an administrator may change per Permission Set.
 *
 * The route then reads the resolved condition of the underlying
 * `database.collection` check from the decision and hands it to the Repository
 * as its Policy, so what the browser may see is decided by exactly the rule
 * stored here and applied as a `WHERE` clause.
 */
export const itTicketsResource = defineCompositeResource(
  IT_TICKETS_PAGE_ID,
  (resource) =>
    resource
      .title(label('itTickets.authz.resource.title'))
      .action('view', (action) =>
        action
          .title(label('itTickets.authz.action.view'))
          .grant('tickets', viewPermission),
      )
      .action('create', (action) =>
        action
          .title(label('itTickets.authz.action.create'))
          .grant('tickets', createPermission),
      )
      .action('start', (action) =>
        action
          .title(label('itTickets.authz.action.start'))
          .grant('tickets', startPermission),
      )
      .action('complete', (action) =>
        action
          .title(label('itTickets.authz.action.complete'))
          .grant('tickets', completePermission),
      ),
);

export type ItTicketsComposite = typeof itTicketsResource;

/**
 * The Record Access keys this module declares, as a stored grant names them:
 * the built-in "every row" rule, and the submitted-by-me rule above. The seed
 * that writes the initial Permission Sets spells these out rather than reading
 * them from here, because a stored grant is history; they are listed so the
 * two readings can be compared.
 */
export const itTicketRecordAccess = {
  all: allRecordsRef.key,
  submittedByMe: submittedByMeRef.key,
} as const;

/** The subsection of the permission editor this feature is listed in. */
export const IT_TICKETS_SECTION = 'business.itTickets';

/** The label the permission editor shows for the Collection itself. */
export const itTicketsCollectionTitle = label('itTickets.authz.resource.title');

/** The label the permission editor shows for the feature's own subsection. */
export const itTicketsSectionTitle = label('itTickets.authz.section.title');
