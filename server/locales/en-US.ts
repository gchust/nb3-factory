import type { LocaleResource } from '@nocobase/i18n';

// The application's own server-side wording: the in-app notifications the help desk sends. Everything else the
// server produces belongs to a plugin's namespace; add keys here as the application starts producing its own.
const enUS = {
  helpdesk: {
    notifications: {
      assignedToEngineer: {
        title: 'Ticket assigned to you',
        body: '“{{title}}” ({{priority}} priority) is now yours.',
      },
      assignedToReporter: {
        title: 'Your ticket was assigned',
        body: '“{{title}}” was assigned to {{assignee}}.',
      },
      processingStarted: {
        title: 'Your ticket is being handled',
        body: '{{assignee}} started work on “{{title}}”.',
      },
      resolved: {
        title: 'Your ticket was resolved',
        body: '“{{title}}” was resolved. Please confirm the result.',
      },
      reopened: {
        title: 'Ticket reopened',
        body: '“{{title}}” was sent back: {{reason}}',
      },
      confirmed: {
        title: 'Ticket confirmed',
        body: '“{{title}}” was confirmed and closed.',
      },
      overdue: {
        title: 'Ticket waiting too long',
        body: '“{{title}}” ({{priority}} priority) has been unresolved for over 24 hours.',
      },
    },
  },
};

export type AppServerResource = LocaleResource<typeof enUS>;

export default enUS;
