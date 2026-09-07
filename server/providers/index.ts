import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import AppExampleProvider from './app-example.js';
import OverdueReminderSchedulerProvider from './overdue-reminder-scheduler.js';
import SalesProvider from './sales-provider.js';

export {
  appExampleServiceToken,
  type AppExampleService,
} from './app-example.js';
export { salesServiceToken, type SalesService } from './sales-service.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  AppExampleProvider,
  SalesProvider,
  OverdueReminderSchedulerProvider,
];

export default serviceProviders;
