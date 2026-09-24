import {
  ConditionInstruction,
  defineWorkflow,
  RunInstruction,
  type WorkflowSourceAst,
} from '@nocobase/app-plugin-workflow';

/**
 * Registering a service request as accepted and telling the assignee about it.
 *
 * The workflow is deliberately small: it is the integration seam the application
 * calls when a supervisor accepts a request, not the place business rules live.
 * The run scripts stay thin and delegate to the package-local `acceptance.ts`
 * module, so the same logic is reusable and testable; the workflow only decides
 * the order in which it runs and which of the two result branches applies.
 */
const workflow: WorkflowSourceAst = defineWorkflow({
  title: 'Service request acceptance',
  description:
    'Registers the acceptance of a service request, records a normal or urgent result from the request urgent flag, and sends the assignee a persistent in-app message. The application triggers it from the accept endpoint; it is not a manual approval process.',
  inputSchema: {
    type: 'object',
    required: ['requestId', 'locale'],
    properties: {
      requestId: { type: 'integer', minimum: 1 },
      locale: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  },
  nodes: [
    RunInstruction.create({
      key: 'registerAcceptance',
      title: 'Register acceptance',
      description:
        'Read the service request by input requestId, move it from pending to processing, and return the assignee, urgent flag and title that the notification needs.',
      config: {
        module: './server/register-acceptance',
        args: { requestId: '{{$input.requestId}}' },
      },
      result: {
        type: 'object',
        properties: {
          assigneeId: { oneOf: [{ type: 'string' }, { type: 'null' }] },
          urgent: { type: 'boolean' },
          title: { type: 'string' },
        },
        required: ['assigneeId', 'urgent', 'title'],
        additionalProperties: false,
      },
    }),
    ConditionInstruction.create({
      key: 'isUrgent',
      title: 'Is the request urgent?',
      description:
        'Compare the accepted request urgent flag with true; an urgent request takes the urgent result branch and a normal request takes the normal result branch.',
      config: {
        expression: {
          '===': [{ var: 'nodeResults.registerAcceptance.urgent' }, true],
        },
      },
    }).branch({
      yes: [
        RunInstruction.create({
          key: 'recordUrgentResult',
          title: 'Record urgent acceptance',
          description:
            'Persist the urgent acceptance result on the request so the list and detail pages show that the request was accepted as urgent.',
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
          title: 'Record normal acceptance',
          description:
            'Persist the normal acceptance result on the request so the list and detail pages show that the request was accepted as normal.',
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
      title: 'Notify the assignee',
      description:
        'Send one persistent in-app message to the accepted request assignee, using the title from registerAcceptance and the request urgent flag to choose the wording; the message links back to the request detail page.',
      config: {
        module: './server/notify-assignee',
        args: {
          requestId: '{{$input.requestId}}',
          locale: '{{$input.locale}}',
          assigneeId: '{{$nodeResults.registerAcceptance.assigneeId}}',
          urgent: '{{$nodeResults.registerAcceptance.urgent}}',
          title: '{{$nodeResults.registerAcceptance.title}}',
        },
      },
      result: { type: 'null' },
    }),
  ],
});

export default workflow;
