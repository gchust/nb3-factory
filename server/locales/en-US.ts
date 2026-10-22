import type { LocaleResource } from '@nocobase/i18n';

// Server-side wording used by the helpdesk lifecycle's notifications. The keys
// are resolved with the application's own `nb3-factory` namespace.
const enUS = {
  helpdesk: {
    notifications: {
      assigned: {
        title: 'New helpdesk ticket assigned',
        body: 'Ticket {{ticketNo}} ({{priority}}) “{{title}}” was assigned to you.',
      },
      reassigned: {
        title: 'Helpdesk ticket reassigned',
        body: 'Ticket {{ticketNo}} ({{priority}}) “{{title}}” was assigned to you.',
      },
      progress: {
        title: 'Helpdesk ticket progress',
        body: 'Ticket {{ticketNo}} “{{title}}”: {{note}}',
      },
      resolved: {
        title: 'Your helpdesk ticket was resolved',
        body: 'Ticket {{ticketNo}} was resolved: {{resolution}}',
      },
      returned: {
        title: 'A resolution was returned',
        body: 'Ticket {{ticketNo}} was returned for further work: {{reason}}',
      },
      closed: {
        title: 'Helpdesk ticket closed',
        body: 'Ticket {{ticketNo}} “{{title}}” was confirmed and closed.',
      },
      overdue: {
        title: 'Helpdesk ticket overdue',
        body: 'Ticket {{ticketNo}} “{{title}}” has been processing for more than {{hours}} hours.',
      },
    },
  },
};

export type AppServerResource = LocaleResource<typeof enUS>;

export default enUS;
