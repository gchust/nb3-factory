import {
  ConditionInstruction,
  defineWorkflow,
  RunInstruction,
  type WorkflowSourceAst,
} from '@nocobase/app-plugin-workflow';

/**
 * Acceptance flow for a service request.
 *
 * The supervisor accepts a request, and this workflow records the acceptance,
 * derives a normal/urgent result from the request's own urgent flag, and sends
 * one persistent in-app message to the assignee. Every step is idempotent, so a
 * retried run cannot accept, re-label, or re-notify the same request twice.
 */
const workflow: WorkflowSourceAst = defineWorkflow({
  title: 'Service request acceptance',
  description:
    'Records that a supervisor accepted a service request, derives the normal or urgent result from the request flag, and notifies the assignee through the in-app message center.',
  inputSchema: {
    type: 'object',
    required: ['requestId'],
    properties: {
      requestId: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  },
  nodes: [
    RunInstruction.create({
      key: 'registerAcceptance',
      title: 'Register acceptance',
      description:
        'Read the request by its id and mark it accepted, recording the acceptance time and returning the assignee, title and urgent flag that the later steps consume.',
      config: {
        module: './server/register-acceptance',
        args: { requestId: '{{$input.requestId}}' },
      },
      result: {
        type: 'object',
        required: ['requestId', 'assigneeId', 'urgent', 'title'],
        properties: {
          requestId: { type: 'string' },
          assigneeId: { type: 'string' },
          urgent: { type: 'boolean' },
          title: { type: 'string' },
        },
        additionalProperties: false,
      },
    }),
    ConditionInstruction.create({
      key: 'evaluateUrgency',
      title: 'Evaluate urgency',
      description:
        'Compare the request urgent flag with true; the yes branch records an urgent result and the no branch records a normal result before both continue to the notification step.',
      config: {
        expression: {
          '===': [{ var: 'nodeResults.registerAcceptance.urgent' }, true],
        },
      },
    }).branch({
      yes: [
        RunInstruction.create({
          key: 'recordUrgentResult',
          title: 'Record urgent result',
          description:
            'Persist the urgent result on the request, leaving an already-recorded result unchanged.',
          config: {
            module: './server/record-result',
            args: {
              requestId: '{{$input.requestId}}',
              result: 'urgent',
            },
          },
        }),
      ],
      no: [
        RunInstruction.create({
          key: 'recordNormalResult',
          title: 'Record normal result',
          description:
            'Persist the normal result on the request, leaving an already-recorded result unchanged.',
          config: {
            module: './server/record-result',
            args: {
              requestId: '{{$input.requestId}}',
              result: 'normal',
            },
          },
        }),
      ],
    }),
    RunInstruction.create({
      key: 'notifyAssignee',
      title: 'Notify assignee',
      description:
        'Send one persistent in-app message to the request assignee through the notification service, linking back to the accepted request; the notification idempotency key keeps retries from sending a duplicate.',
      config: {
        module: './server/notify-assignee',
        args: { requestId: '{{$input.requestId}}' },
      },
    }),
  ],
});

export default workflow;
