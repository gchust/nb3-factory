import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import ServiceAIProvider from './ai.js';
import ScheduleModuleProvider from './schedule.js';
import ServiceModuleProvider from './service.js';

// Order is registration order, not lifecycle dependency: every provider's
// `boot` runs after every `register`, so `ServiceAIProvider.boot` reaches the AI
// manager the AI Employee plugin registered, and each provider's own services
// are bound before another provider's `boot` reads them.
const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  ServiceModuleProvider,
  ServiceAIProvider,
  ScheduleModuleProvider,
];

export default serviceProviders;
