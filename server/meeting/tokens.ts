import { createServiceToken } from '@nocobase/service-provider';
import type { MeetingBookingService } from './service.js';
import type { MeetingAuthorizationPolicies } from './store.js';

/**
 * Builds a booking service bound to one authorization decision. A route
 * resolves the authorization decision for the composite action it is serving
 * and then asks this factory for a service already scoped to it, so no route
 * can hand the domain layer a repository wider than the identity holds.
 */
export type MeetingBookingServiceFactory = (
  policies: MeetingAuthorizationPolicies,
) => MeetingBookingService;

export const meetingBookingServiceFactoryToken =
  createServiceToken<MeetingBookingServiceFactory>(
    'nb3-factory.meeting-booking-service',
  );
