import {
  defineWorkflow,
  RunInstruction,
  type WorkflowSourceAst,
  type WorkflowSourceInput,
} from '@nocobase/app-plugin-workflow';

/**
 * Notifies a sales person when a lead is assigned to them. Triggered by the
 * sales API with eventKey `lead-assigned:<leadId>:<ownerId>` so the same
 * assignment is notified at most once.
 */
const workflow: WorkflowSourceAst = defineWorkflow({
  title: 'Lead assignment notification',
  description: 'Notifies the assigned sales person when a lead is assigned.',
  inputSchema: {
    type: 'object',
    required: ['leadId', 'ownerId'],
    properties: {
      leadId: { type: 'number', minimum: 1 },
      ownerId: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  },
  nodes: [
    RunInstruction.create({
      key: 'notifyLeadAssigned',
      title: 'Notify lead assigned',
      config: {
        module: './server/notify-lead-assigned',
        args: {
          leadId: '{{$input.leadId}}',
          ownerId: '{{$input.ownerId}}',
        },
      },
    }),
  ],
} satisfies WorkflowSourceInput);

export default workflow;
