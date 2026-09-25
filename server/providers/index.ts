import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import TestNotificationProvider from './test-notification.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  TestNotificationProvider,
];

export default serviceProviders;
