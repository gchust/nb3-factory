import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import AppExampleProvider from './app-example.js';
import MeetingBookingProvider from './meeting-bookings.js';
import MeetingRoomProvider from './meeting-rooms.js';

export {
  appExampleServiceToken,
  type AppExampleService,
} from './app-example.js';
export {
  meetingRoomServiceToken,
  MeetingRoomServiceError,
  type MeetingRoom,
  type MeetingRoomInput,
  type MeetingRoomService,
} from './meeting-rooms.js';
export {
  meetingBookingServiceToken,
  MeetingBookingServiceError,
  BOOKING_STATUS_BOOKED,
  BOOKING_STATUS_CANCELLED,
  type BookingStatus,
  type MeetingBooking,
  type MeetingBookingInput,
  type MeetingBookingListFilters,
  type MeetingBookingService,
  type MeetingBookingWithRoom,
} from './meeting-bookings.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  AppExampleProvider,
  MeetingRoomProvider,
  MeetingBookingProvider,
];

export default serviceProviders;
