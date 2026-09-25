import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';

import { createTestNotificationReceiverRouter } from '../notifications/test-receiver.js';

/**
 * The isolated receiver the external test channel delivers to.
 *
 * It is an application route rather than a new delivery framework: the Provider posts to it over loopback HTTP, so
 * the message travels the normal channel → provider → delivery-record path. The router validates a per-process token
 * because no user session is available to a server-to-server call.
 */
const testNotificationRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes(() => createTestNotificationReceiverRouter());

export default testNotificationRoutes;
