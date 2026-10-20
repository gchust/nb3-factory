import type { LocaleResource } from '@nocobase/i18n';

// The application's own server-side wording. Add keys here as the application starts producing its own text; use
// `overrides` to reword a plugin's.
const enUS = {
  helpdesk: {
    notifications: {
      subject: '{{ticketNo}} · {{title}}',
      assigned: 'Ticket assigned: {{ticketNo}}',
      started: 'Ticket in progress: {{ticketNo}}',
      resolved: 'Ticket resolved: {{ticketNo}}',
      reopened: 'Ticket reopened: {{ticketNo}}',
      closed: 'Ticket closed: {{ticketNo}}',
      cancelled: 'Ticket cancelled: {{ticketNo}}',
      escalated: 'Ticket overdue: {{ticketNo}}',
    },
    permissionSets: {
      employee: 'Employee',
      supportEngineer: 'Support engineer',
      serviceDesk: 'Service desk',
    },
    errors: {
      authenticationRequired: 'Sign in to continue.',
      authorizationDenied: 'The current account may not perform this action.',
      ticketNotFound: 'Ticket {{ticketId}} was not found.',
      transitionRefused: 'The ticket could not be moved to that state.',
      createFailed: 'The ticket was not created.',
      attachmentFailed: 'The files were not attached.',
      titleAndDescriptionRequired: 'A title and description are required.',
      unknownCategory: 'Choose a valid ticket category.',
      unknownPriority: 'Choose a valid ticket priority.',
      attachmentUnavailable: 'One or more attachments are unavailable.',
      commentRequired: 'A comment body is required.',
      fileNotFound: 'The file was not found.',
      workflowExecutionNotFound:
        'Workflow execution {{recordId}} was not found.',
      workflowNotFound: 'Workflow {{workflowName}} was not found.',
    },
    workflow: {
      definitionTitle: 'Tickets',
    },
    lifecycle: {
      guards: {
        requesterMismatch:
          'A ticket can only be created for the signed-in requester.',
        engineerRequired: 'Only support engineers can claim pending tickets.',
        alreadyAssigned: 'This ticket has already been assigned.',
        serviceDeskAssign: 'Only the service desk can assign tickets.',
        engineerSelected: 'An engineer must be selected.',
        assigneeOrServiceDeskStart:
          'Only the assigned engineer or the service desk can start this ticket.',
        assigneeOrServiceDeskResolve:
          'Only the assignee or the service desk can resolve this ticket.',
        resolutionRequired: 'A resolution is required.',
        requesterReopen:
          'Only the requester or the service desk can reopen this ticket.',
        requesterClose:
          'Only the requester or an administrator can close this resolved ticket.',
        serviceDeskCancel: 'Only the service desk can cancel tickets.',
        cancelReasonRequired: 'A cancel reason is required.',
        systemEscalate: 'Overdue escalation is performed by the server.',
        systemTouch: 'Activity timestamps are maintained by the server.',
      },
    },
  },
};

export type AppServerResource = LocaleResource<typeof enUS>;

export default enUS;
