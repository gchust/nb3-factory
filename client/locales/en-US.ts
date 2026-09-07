import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  app: {
    title: 'NocoBase',
  },
  actions: {
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    language: 'Language',
  },
  account: {
    openMenu: 'Open account menu',
    fallback: 'Account',
    signOut: 'Sign out',
    signingOut: 'Signing out…',
  },
  navigation: {
    home: 'Home',
    open: 'Open navigation',
    close: 'Close navigation',
    expand: 'Expand navigation',
    collapse: 'Collapse navigation',
    label: 'Application navigation',
    meetingRooms: 'Meeting Rooms',
    meetingBookings: 'Bookings',
  },
  common: {
    loading: 'Loading…',
    error: 'Something went wrong. Please try again.',
    retry: 'Retry',
    back: 'Back',
  },
  meetingRooms: {
    title: 'Meeting Rooms',
    subtitle: 'Maintain the meeting rooms used for bookings.',
    create: 'New Meeting Room',
    edit: 'Edit Meeting Room',
    detail: 'Meeting Room Details',
    code: 'Code',
    name: 'Name',
    location: 'Location',
    capacity: 'Capacity',
    capacityUnit: 'people',
    equipment: 'Equipment',
    available: 'Available',
    availableYes: 'Available',
    availableNo: 'Unavailable',
    actions: 'Actions',
    view: 'View',
    editAction: 'Edit',
    backToList: 'Back to meeting rooms',
    empty: 'No meeting rooms yet.',
    createSuccess: 'Meeting room created.',
    updateSuccess: 'Meeting room updated.',
    codeTaken: 'A meeting room with this code already exists.',
    requiredFields: 'Code, name, location and capacity are required.',
    capacityInvalid: 'Capacity must be a positive integer.',
    viewBookings: 'View bookings',
  },
  meetingBookings: {
    title: 'Bookings',
    subtitle: 'Book meeting rooms and review the schedule.',
    create: 'New Booking',
    detail: 'Booking Details',
    subject: 'Subject',
    room: 'Meeting Room',
    organizer: 'Organizer',
    startTime: 'Start Time',
    endTime: 'End Time',
    notes: 'Notes',
    status: 'Status',
    booked: 'Booked',
    cancelled: 'Cancelled',
    actions: 'Actions',
    view: 'View',
    cancel: 'Cancel Booking',
    cancelConfirmTitle: 'Cancel this booking?',
    cancelConfirmDescription:
      'The time slot will be released and the booking will be marked as cancelled.',
    cancelSuccess: 'Booking cancelled.',
    backToList: 'Back to bookings',
    filterRoom: 'Filter by room',
    filterDate: 'Filter by date',
    searchTitle: 'Search by subject',
    allRooms: 'All rooms',
    empty: 'No bookings match the current filters.',
    createSuccess: 'Booking created.',
    timeConflict:
      'This room is already booked for part of the requested time. Please choose another time slot.',
    invalidTimeRange: 'The end time must be later than the start time.',
    roomUnavailable: 'This room is not available for booking.',
    requiredFields:
      'Subject, room, organizer, start time and end time are required.',
    selectRoom: 'Select a room',
    clearFilters: 'Clear filters',
  },
};

/**
 * The shape every locale of this application follows, derived from the English wording above.
 *
 * Anything a plugin does not translate falls back to this namespace, so a term defined here is reused everywhere
 * without each plugin repeating it.
 */
export type AppResource = LocaleResource<typeof enUS>;

export default enUS;
