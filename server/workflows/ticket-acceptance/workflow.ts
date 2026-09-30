import {
  ConditionInstruction,
  defineWorkflow,
  RunInstruction,
  type WorkflowSourceAst,
} from '@nocobase/app-plugin-workflow';

/**
 * Automatic acceptance for a newly created service ticket.
 *
 * The workflow reads the ticket's priority and branches on it: an urgent or
 * high-priority ticket gets a four-hour response deadline, everything else gets
 * twenty-four hours. Both branches then run the same idempotent acceptance
 * step, which assigns the least-loaded engineer, moves the ticket from
 * `pending_acceptance` to `pending_processing`, writes the operation journal
 * row that makes a retry safe, and sends the in-app notification. A failure is
 * recorded on the ticket as `acceptanceStatus = failed` with its message before
 * the error is re-thrown, so the run itself is marked failed rather than
 * silently succeeding.
 */
const workflow: WorkflowSourceAst = defineWorkflow({
  title: 'Service ticket acceptance',
  description:
    'Accepts a newly created service ticket automatically: classifies its priority, sets the matching response deadline, assigns the least-loaded engineer, and notifies them. A failure is recorded on the ticket and on the operation journal, then surfaces as a failed run.',
  inputSchema: {
    type: 'object',
    required: ['ticketId'],
    properties: {
      ticketId: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  },
  nodes: [
    RunInstruction.create({
      key: 'classifyPriority',
      title: 'Classify priority',
      description:
        'Read the ticket and return its priority plus whether it is high or urgent; the result decides which response deadline the next condition applies.',
      config: {
        module: './server/classify-priority',
        args: { ticketId: '{{$input.ticketId}}' },
      },
      result: {
        type: 'object',
        required: ['priority', 'highPriority', 'handled'],
        properties: {
          priority: { type: 'string' },
          highPriority: { type: 'boolean' },
          handled: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    }),
    ConditionInstruction.create({
      key: 'needsEscalation',
      description:
        'Branch on the classified priority: yes gives a high or urgent ticket a four-hour deadline through applyUrgentSla, while no gives every other ticket a twenty-four hour deadline through applyStandardSla.',
      config: {
        expression: {
          '===': [{ var: 'nodeResults.classifyPriority.highPriority' }, true],
        },
      },
    }).branch({
      yes: [
        RunInstruction.create({
          key: 'applyUrgentSla',
          description:
            'Set a four-hour response deadline on the ticket, unless it already has one or has already been accepted, and return the deadline.',
          config: {
            module: './server/apply-urgent-sla',
            args: { ticketId: '{{$input.ticketId}}' },
          },
          result: {
            type: 'object',
            required: ['dueAt'],
            properties: {
              dueAt: { oneOf: [{ type: 'string' }, { type: 'null' }] },
            },
            additionalProperties: false,
          },
        }),
      ],
      no: [
        RunInstruction.create({
          key: 'applyStandardSla',
          description:
            'Set a twenty-four hour response deadline on the ticket, unless it already has one or has already been accepted, and return the deadline.',
          config: {
            module: './server/apply-standard-sla',
            args: { ticketId: '{{$input.ticketId}}' },
          },
          result: {
            type: 'object',
            required: ['dueAt'],
            properties: {
              dueAt: { oneOf: [{ type: 'string' }, { type: 'null' }] },
            },
            additionalProperties: false,
          },
        }),
      ],
    }),
    RunInstruction.create({
      key: 'applyAcceptance',
      title: 'Accept the ticket',
      description:
        'Run the idempotent acceptance for the ticket after either deadline branch returns: assign the least-loaded engineer, move it to pending_processing, journal the operation, and notify the assignee. On failure, record the message on the ticket and notify supervisors before re-throwing.',
      config: {
        module: './server/apply-acceptance',
        args: { ticketId: '{{$input.ticketId}}' },
      },
      result: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string' },
          assigneeId: { oneOf: [{ type: 'string' }, { type: 'null' }] },
        },
        additionalProperties: false,
      },
    }),
  ],
});

export default workflow;
