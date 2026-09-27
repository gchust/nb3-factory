import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';
import { MeetingProvider } from './meeting.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  MeetingProvider,
];

export default serviceProviders;
