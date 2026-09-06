import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import AppExampleProvider from './app-example.js';
import ItTicketServiceProvider from './it-ticket-service.js';

export {
  appExampleServiceToken,
  type AppExampleService,
} from './app-example.js';
export {
  itTicketServiceToken,
  ItTicketServiceImpl,
  type ItTicketService,
  type ItTicketView,
  type ItTicketListQuery,
  type ItTicketListResult,
  type ItTicketCreateInput,
  type ItTicketUpdateInput,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
  type AssigneeCandidate,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  STATUS_TRANSITIONS,
  isTicketCategory,
  isTicketPriority,
  isTicketStatus,
  nextStatuses,
  TicketNotFoundError,
  InvalidStatusTransitionError,
  AssigneeNotFoundError,
} from './it-ticket-service.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  AppExampleProvider,
  ItTicketServiceProvider,
];

export default serviceProviders;
