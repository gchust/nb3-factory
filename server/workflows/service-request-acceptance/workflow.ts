import {
  ConditionInstruction,
  defineWorkflow,
  RunInstruction,
  type WorkflowSourceAst,
} from '@nocobase/app-plugin-workflow';

/**
 * Acceptance of a service request.
 *
 * A supervisor selects an assignee and accepts a pending request. The workflow
 * registers the acceptance, routes on the request's urgent flag so the run
 * carries a normal or urgent result, and then sends exactly one persistent
 * in-app message to the assignee pointing back at the request.
 *
 * Keys are the workflow directory name and stay stable across revisions.
 */
const workflow: WorkflowSourceAst = defineWorkflow({
  title: 'Service request acceptance',
  description:
    'Registers the acceptance of a service request, records a normal or urgent result from the request urgency flag, and notifies the assignee in the message center.',
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
        'Load the pending service request and mark it accepted, returning its urgency flag, assignee and title for downstream routing. Re-running an already accepted request is a no-op that returns the stored values.',
      config: {
        module: './server/register-acceptance',
        args: {
          requestId: '{{$input.requestId}}',
        },
      },
      result: {
        type: 'object',
        required: ['urgent', 'assigneeId', 'title'],
        properties: {
          urgent: { type: 'boolean' },
          assigneeId: { type: 'string' },
          title: { type: 'string' },
        },
        additionalProperties: false,
      },
    }),
    ConditionInstruction.create({
      key: 'routeByUrgency',
      title: 'Route by urgency',
      description:
        'Take the yes branch and record an urgent result when the accepted request is urgent; otherwise take the no branch and record a normal result.',
      config: {
        expression: {
          '===': [{ var: 'nodeResults.registerAcceptance.urgent' }, true],
        },
      },
    }).branch({
      yes: [
        RunInstruction.create({
          key: 'markUrgent',
          title: 'Record urgent result',
          description:
            'Persist the urgent acceptance result on the request before the assignee is notified.',
          config: {
            module: './server/mark-urgent',
            args: { requestId: '{{$input.requestId}}' },
          },
        }),
      ],
      no: [
        RunInstruction.create({
          key: 'markNormal',
          title: 'Record normal result',
          description:
            'Persist the normal acceptance result on the request before the assignee is notified.',
          config: {
            module: './server/mark-normal',
            args: { requestId: '{{$input.requestId}}' },
          },
        }),
      ],
    }),
    RunInstruction.create({
      key: 'notifyAssignee',
      title: 'Notify assignee',
      description:
        'Re-read the accepted request from the database and send one persistent in-app message to its assignee, targeting the request detail route. The stable idempotency key keeps a retry from sending a second message.',
      config: {
        module: './server/notify-assignee',
        args: { requestId: '{{$input.requestId}}' },
      },
    }),
  ],
});

export default workflow;
