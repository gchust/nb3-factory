import {
  defineWorkflow,
  RunInstruction,
  type WorkflowSourceAst,
  type WorkflowSourceInput,
} from '@nocobase/app-plugin-workflow';

/**
 * Notifies the opportunity owner and all sales managers when an opportunity is
 * won. Triggered by the sales API with eventKey `opportunity-won:<id>` so a
 * won opportunity is announced once.
 */
const workflow: WorkflowSourceAst = defineWorkflow({
  title: 'Opportunity win notification',
  description:
    'Notifies the owner and sales managers when an opportunity is won.',
  inputSchema: {
    type: 'object',
    required: ['opportunityId'],
    properties: {
      opportunityId: { type: 'number', minimum: 1 },
    },
    additionalProperties: false,
  },
  nodes: [
    RunInstruction.create({
      key: 'notifyOpportunityWon',
      title: 'Notify opportunity won',
      config: {
        module: './server/notify-opportunity-won',
        args: {
          opportunityId: '{{$input.opportunityId}}',
        },
      },
    }),
  ],
} satisfies WorkflowSourceInput);

export default workflow;
