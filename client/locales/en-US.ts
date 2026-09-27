import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  'auth.welcome': 'Welcome back',
  'auth.loginDescription': 'Sign in with your username or email and password.',
  'auth.registerTitle': 'Create an account',
  'auth.registerDescription': 'Create an account to get started.',
  'auth.forgotTitle': 'Forgot password',
  'auth.forgotDescription':
    'Enter your email and we will send a reset link if the account exists.',
  'auth.resetTitle': 'Reset password',
  'auth.resetDescription': 'Choose a new password for your account.',
  'auth.identifier': 'Username or email',
  'auth.password': 'Password',
  'auth.signIn': 'Sign in',
  'auth.signInLink': 'sign in',
  'auth.signingIn': 'Signing in…',
  'auth.hidePassword': 'Hide password',
  'auth.showPassword': 'Show password',
  'auth.forgotLink': 'Forgot password?',
  'auth.signUp': 'Sign up',
  'auth.createAccount': 'Create account',
  'auth.creatingAccount': 'Creating account…',
  'auth.name': 'Name',
  'auth.username': 'Username',
  'auth.email': 'Email',
  'auth.confirmPassword': 'Confirm password',
  'auth.existingAccount': 'Already have an account?',
  'auth.resetting': 'Resetting…',
  'auth.newPassword': 'New password',
  'auth.confirmNewPassword': 'Confirm new password',
  'auth.invalidResetLink':
    'This password reset link is invalid or has expired.',
  'auth.returnTo': 'Return to',
  'auth.sendResetLink': 'Send reset link',
  'auth.sending': 'Sending…',
  'auth.resetSent': 'If the account exists, a reset link has been sent.',
  'auth.rememberPassword': 'Remember your password?',
  'auth.methods': 'Authentication methods',
  'auth.continueWith': 'Or continue with',
  'auth.about': 'About this application',
  'auth.marketingDescription':
    'Give AI a flexible frontend framework to shape each experience, while NocoBase secures the data, permissions, workflows and governance underneath.',
  'auth.platform': 'AI-native application platform',
  'auth.frontendDescription':
    'Compose interfaces freely on a flexible framework.',
  'auth.frontend': 'AI-native frontend',
  'auth.foundationDescription':
    'Reliable data, access control, workflows and governance.',
  'auth.foundation': 'NocoBase foundation',
  'auth.marketingFooter': 'Freedom above. Confidence below.',
  'auth.marketingTitleFirst': 'Let AI build freely.',
  'auth.marketingTitleSecond': 'NocoBase keeps it',
  'auth.marketingTitleThird': 'reliable.',
  'status.loading': 'Loading',
  'status.loadingPage': 'Loading page',
  'status.loadingSettings': 'Loading settings',
  'status.loadingDev': 'Loading dev tools',
  'status.denied': 'Access denied',
  'status.pageFailed': 'Unable to load page',
  'status.retry': 'Retry',
  'navigation.brandHome': 'NocoBase home',
  'navigation.brandApps': 'NocoBase applications',
  'auth.passwordMismatch': "Passwords don't match.",
  'routeOverlay.close': 'Close',
  'status.deniedDescription': 'You do not have permission to access {{label}}.',
  'status.routeFailedDescription':
    'Route {{label}} from {{packageName}} could not be loaded.',
  shell: {
    workspace: 'AI application workspace',
    buildFreely: 'AI builds freely.',
    reliability: '<brand>NocoBase</brand> keeps it reliable.',
  },
  surface: {
    backToApp: 'Back to app',
    loading: 'Loading {{title}}',
    navigation: '{{title}} navigation',
    page: '{{title}} page',
  },
  settings: {
    title: 'Settings',
    emptyTitle: 'No settings available',
    emptyDescription:
      'No enabled plugin contributes a settings page you have access to.',
  },
  dev: {
    componentExamples: 'Component examples',
    title: 'Dev tools',
    emptyTitle: 'No dev tools available',
    emptyDescription:
      'No enabled plugin contributes a dev page you have access to.',
  },
  home: {
    title: 'Start building your application',
    description:
      'Describe what you need to your AI Agent, then build pages, data models, and business workflows.',
  },

  appearance: {
    title: 'Appearance',
    mode: 'Color mode',
    preset: 'Theme',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
    themes: { default: 'Spacious', compact: 'Compact' },
  },
  app: {
    title: 'NocoBase',
  },
  actions: {
    close: 'Close',
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    language: 'Language',
  },
  notices: {
    serverLocaleFallback:
      'The server does not support this language, so server messages will use English.',
    languageChangeFailed:
      'Unable to complete the language change. Please try again.',
  },
  account: {
    signOutFailed: 'Unable to sign out. Please try again.',
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
    breadcrumb: 'Breadcrumb',
  },
  dataTable: {
    noResults: 'No results.',
    sortAscending: 'Asc',
    sortDescending: 'Desc',
    hideColumn: 'Hide',
    view: 'View',
    toggleColumns: 'Toggle columns',
    selectedCount: '{{selected}} of {{total}} row(s) selected.',
    rowsPerPage: 'Rows per page',
    pageOf: 'Page {{page}} of {{pageCount}}',
    firstPage: 'Go to first page',
    previousPage: 'Go to previous page',
    nextPage: 'Go to next page',
    lastPage: 'Go to last page',
  },
  datePicker: {
    placeholder: 'Pick a date',
    rangePlaceholder: 'Pick a date range',
  },
  'meeting.navigation.rooms': 'Meeting rooms',
  'meeting.navigation.bookings': 'Room bookings',
  'meeting.authz.section': 'Meeting rooms',
  'meeting.authz.rooms': 'Meeting rooms',
  'meeting.authz.rooms.view': 'View meeting rooms',
  'meeting.authz.rooms.manage': 'Manage meeting rooms',
  'meeting.authz.bookings': 'Room bookings',
  'meeting.authz.bookings.view': 'View room bookings',
  'meeting.authz.bookings.book': 'Book a meeting room',
  'meeting.authz.bookings.cancel': 'Cancel own bookings',
  'meeting.authz.permissions.roomRead': 'Read meeting rooms',
  'meeting.authz.permissions.roomManage': 'Manage meeting rooms',
  'meeting.authz.permissions.bookingRead': 'Read room bookings',
  'meeting.authz.permissions.bookingCreate': 'Create room bookings',
  'meeting.authz.permissions.bookingCancel': 'Cancel room bookings',
  'meeting.authz.collections.rooms': 'Meeting rooms',
  'meeting.authz.collections.bookings': 'Room bookings',
  'meeting.rooms.title': 'Meeting rooms',
  'meeting.rooms.description':
    'Create the rooms employees can book and keep their name, capacity and location up to date.',
  'meeting.rooms.new': 'New room',
  'meeting.rooms.createTitle': 'New meeting room',
  'meeting.rooms.createDescription':
    'Add a room employees can book. Its name has to be unique.',
  'meeting.rooms.editTitle': 'Edit meeting room',
  'meeting.rooms.editDescription': 'Update the room details.',
  'meeting.rooms.columns.name': 'Name',
  'meeting.rooms.columns.capacity': 'Capacity',
  'meeting.rooms.columns.location': 'Location',
  'meeting.rooms.columns.actions': 'Actions',
  'meeting.rooms.empty': 'No meeting rooms yet. Create the first one.',
  'meeting.rooms.fields.name': 'Name',
  'meeting.rooms.fields.capacity': 'Capacity',
  'meeting.rooms.fields.location': 'Location',
  'meeting.rooms.fields.description': 'Description',
  'meeting.rooms.actions.open': 'Actions for {{name}}',
  'meeting.rooms.actions.edit': 'Edit',
  'meeting.rooms.actions.delete': 'Delete',
  'meeting.rooms.created': 'Meeting room created.',
  'meeting.rooms.updated': 'Meeting room updated.',
  'meeting.rooms.deleted': 'Meeting room deleted.',
  'meeting.rooms.deleteTitle': 'Delete meeting room?',
  'meeting.rooms.deleteDescription':
    'This deletes “{{name}}”. A room that still has bookings cannot be deleted.',
  'meeting.rooms.error.nameRequired': 'Enter a name.',
  'meeting.rooms.error.capacityInvalid': 'Enter a whole number of at least 1.',
  'meeting.rooms.error.nameTaken': 'A room with this name already exists.',
  'meeting.rooms.error.notFound': 'This room no longer exists.',
  'meeting.rooms.error.inUse':
    'This room still has bookings. Cancel or remove them before deleting it.',
  'meeting.rooms.error.forbidden':
    'You do not have permission to manage meeting rooms.',
  'meeting.rooms.error.requestFailed': 'The request failed. Please try again.',
  'meeting.rooms.error.loadFailed':
    'Unable to load meeting rooms. Please try again.',
  'meeting.bookings.title': 'Room bookings',
  'meeting.bookings.description':
    'Book a meeting room and cancel a booking you made. Two bookings cannot overlap in the same room.',
  'meeting.bookings.new': 'New booking',
  'meeting.bookings.createTitle': 'New room booking',
  'meeting.bookings.createDescription':
    'Pick a room and a time range. The end has to be after the start.',
  'meeting.bookings.submit': 'Book',
  'meeting.bookings.columns.title': 'Meeting',
  'meeting.bookings.columns.room': 'Room',
  'meeting.bookings.columns.start': 'Start',
  'meeting.bookings.columns.end': 'End',
  'meeting.bookings.columns.status': 'Status',
  'meeting.bookings.columns.actions': 'Actions',
  'meeting.bookings.status.confirmed': 'Confirmed',
  'meeting.bookings.status.cancelled': 'Cancelled',
  'meeting.bookings.empty': 'No bookings yet.',
  'meeting.bookings.unknownRoom': 'Unknown room',
  'meeting.bookings.fields.title': 'Meeting title',
  'meeting.bookings.fields.room': 'Room',
  'meeting.bookings.fields.startAt': 'Start',
  'meeting.bookings.fields.endAt': 'End',
  'meeting.bookings.selectRoom': 'Select a room',
  'meeting.bookings.roomOption': '{{name}} · {{count}} seats',
  'meeting.bookings.cancel': 'Cancel',
  'meeting.bookings.cancelTitle': 'Cancel booking?',
  'meeting.bookings.cancelDescription':
    'This cancels “{{title}}” and frees the room for that time.',
  'meeting.bookings.cancelled': 'Booking cancelled.',
  'meeting.bookings.created': 'Booking confirmed.',
  'meeting.bookings.error.titleRequired': 'Enter a meeting title.',
  'meeting.bookings.error.roomRequired': 'Select a room.',
  'meeting.bookings.error.timeRequired': 'Choose a start and an end time.',
  'meeting.bookings.error.invalidRange':
    'The end time has to be after the start time.',
  'meeting.bookings.error.conflict':
    'Another booking already covers this room and time.',
  'meeting.bookings.error.roomNotFound': 'This room no longer exists.',
  'meeting.bookings.error.notFound': 'This booking no longer exists.',
  'meeting.bookings.error.forbidden':
    'You do not have permission to book meeting rooms.',
  'meeting.bookings.error.requestFailed':
    'The request failed. Please try again.',
  'meeting.bookings.error.loadFailed':
    'Unable to load room bookings. Please try again.',
};

/**
 * The shape every locale of this application follows, derived from the English wording above.
 *
 * Anything a plugin does not translate falls back to this namespace, so a term defined here is reused everywhere
 * without each plugin repeating it.
 */
export type AppResource = LocaleResource<typeof enUS>;

export default enUS;
