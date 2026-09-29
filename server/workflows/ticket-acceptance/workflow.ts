import {
  ConditionInstruction,
  defineWorkflow,
  RunInstruction,
  type WorkflowSourceAst,
} from '@nocobase/app-plugin-workflow';

/**
 * Supervisor acceptance of a service ticket.
 *
 * Routes urgent work through the urgent acceptance script and everything else
 * through the standard one, then records the resulting status. Acceptance
 * itself is idempotent in the ticket service, so a retried trigger is safe.
 *
 * Latest change: initial version, branching on the ticket priority supplied by
 * the accept endpoint.
 */
const workflow: WorkflowSourceAst = defineWorkflow({
  title: 'Ticket acceptance',
  description:
    'Accepts a service ticket on behalf of the supervisor, branching on urgency and emitting the in-app message to the assignee.',
  inputSchema: {
    type: 'object',
    required: ['ticketId', 'operatorId', 'priority'],
    properties: {
      ticketId: { type: 'integer', minimum: 1 },
      operatorId: { type: 'string', minLength: 1 },
      priority: { type: 'string', enum: ['normal', 'urgent'] },
      acceptNote: { type: 'string', maxLength: 2000 },
    },
    additionalProperties: false,
  },
  nodes: [
    ConditionInstruction.create({
      key: 'routeAcceptance',
      title: 'Route by urgency',
      description:
        'Compare the ticket priority with urgent; urgent work is accepted by the urgent script so it takes the short due window, while every other ticket uses the standard script.',
      config: {
        expression: { '===': [{ var: 'input.priority' }, 'urgent'] },
      },
    }).branch({
      yes: [
        RunInstruction.create({
          key: 'acceptUrgent',
          title: 'Accept urgent ticket',
          description:
            'Accept the ticket through the idempotent ticket service; the service sets the short urgent due window and notifies the assignee once.',
          config: {
            module: './server/accept-urgent',
            args: {
              ticketId: '{{$input.ticketId}}',
              operatorId: '{{$input.operatorId}}',
              acceptNote: '{{$input.acceptNote}}',
            },
          },
        }),
      ],
      no: [
        RunInstruction.create({
          key: 'acceptStandard',
          title: 'Accept standard ticket',
          description:
            'Accept the ticket through the idempotent ticket service; the service sets the normal due window and notifies the assignee once.',
          config: {
            module: './server/accept-standard',
            args: {
              ticketId: '{{$input.ticketId}}',
              operatorId: '{{$input.operatorId}}',
              acceptNote: '{{$input.acceptNote}}',
            },
          },
        }),
      ],
    }),
    RunInstruction.create({
      key: 'summarizeAcceptance',
      title: 'Summarize acceptance',
      description:
        'Read the ticket back after either branch returns and record its code, resulting status and urgency in the run result.',
      config: {
        module: './server/summarize-acceptance',
        args: {
          ticketId: '{{$input.ticketId}}',
          operatorId: '{{$input.operatorId}}',
          urgency: '{{$input.priority}}',
        },
      },
      result: {
        type: 'object',
        required: ['code', 'status'],
        properties: {
          code: { type: 'string' },
          status: { type: 'string' },
          urgency: { type: 'string' },
        },
        additionalProperties: true,
      },
    }),
  ],
});

export default workflow;
