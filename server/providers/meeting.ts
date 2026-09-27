import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { ServiceProvider } from '@nocobase/service-provider';
import { registerMeetingAuthorization } from '../meeting/authorization.js';
import { MeetingBookingService } from '../meeting/service.js';
import { createRepositoryStore } from '../meeting/store.js';
import { meetingBookingServiceFactoryToken } from '../meeting/tokens.js';

/**
 * Registers the meeting-room booking feature: its composite resources, its
 * collection opt-ins, its place in the permissions workspace, and the factory
 * routes use to obtain a policy-scoped service.
 *
 * Registering the composites here, rather than importing the authorization
 * module for its side effects, keeps the runtime wiring in one place and
 * leaves `server/meeting/authorization.ts` safe to import from the seed.
 */
export class MeetingProvider extends ServiceProvider<Application> {
  name = 'nb3-factory/meeting';

  register(): void {
    const container = this.app.container;

    // The authorization plugin is optional in a runtime: without it there is
    // no authorization service to extend and no permission model to take part
    // in. The service factory below stays usable either way.
    if (container.has(authorizationToken)) {
      registerMeetingAuthorization(container.resolve(authorizationToken));
    }

    container.singleton(meetingBookingServiceFactoryToken, (container) => {
      const database = container.resolve(databaseManagerToken);
      return (policies) =>
        new MeetingBookingService(createRepositoryStore(database, policies));
    });
  }
}
