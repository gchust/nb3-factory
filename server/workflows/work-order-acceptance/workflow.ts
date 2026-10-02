import {
  ConditionInstruction,
  defineWorkflow,
  RunInstruction,
  type WorkflowSourceAst,
} from '@nocobase/app-plugin-workflow';

/**
 * Work order acceptance.
 *
 * The application owns the ordinary form saves and the manual status transitions; acceptance itself is a
 * business decision with a branch and a notification, so it runs here. The same workflow serves both entry
 * points:
 *
 * - `auto` — triggered right after a work order is created. A normal or low priority order is accepted and
 *   dispatched to the responsible engineer; a high or urgent one is escalated and stays pending acceptance.
 * - `manual` — triggered by the supervisor's accept action. The order is accepted whatever its priority.
 *
 * The condition node branches on the priority-escalation decision so urgent and ordinary acceptances record a
 * different acceptance note, and the final node delivers the in-app message to whoever must act next.
 */
const workflow: WorkflowSourceAst = defineWorkflow({
  title: 'Work order acceptance',
  description:
    'Accepts or escalates a work order, records the priority-specific acceptance note and notifies the responsible person. Latest change: introduced the source-managed workflow to own the acceptance decision.',
  inputSchema: {
    type: 'object',
    required: ['workOrderId', 'mode', 'actorId', 'assigneeId', 'locale'],
    properties: {
      workOrderId: { type: 'integer', minimum: 1 },
      mode: { type: 'string', enum: ['auto', 'manual'] },
      actorId: { type: 'string' },
      assigneeId: { type: 'string' },
      locale: { type: 'string' },
    },
    additionalProperties: false,
  },
  nodes: [
    RunInstruction.create({
      key: 'registerAcceptance',
      title: 'Register acceptance',
      description:
        "Loads the work order, refuses to act twice on an order that already left pending acceptance, then either applies the auto-acceptance/escalation rule or accepts on the supervisor's behalf. Returns the decision and the people downstream needs.",
      config: {
        module: './server/register-acceptance',
        args: {
          workOrderId: '{{$input.workOrderId}}',
          mode: '{{$input.mode}}',
          actorId: '{{$input.actorId}}',
          assigneeId: '{{$input.assigneeId}}',
        },
      },
      result: {
        type: 'object',
        required: [
          'accepted',
          'escalated',
          'alreadyProcessed',
          'assigneeId',
          'supervisorId',
          'code',
          'title',
          'priority',
        ],
        properties: {
          accepted: { type: 'boolean' },
          escalated: { type: 'boolean' },
          alreadyProcessed: { type: 'boolean' },
          assigneeId: { oneOf: [{ type: 'string' }, { type: 'null' }] },
          supervisorId: { oneOf: [{ type: 'string' }, { type: 'null' }] },
          code: { oneOf: [{ type: 'string' }, { type: 'null' }] },
          title: { type: 'string' },
          priority: { type: 'string' },
        },
        additionalProperties: false,
      },
    }),
    ConditionInstruction.create({
      key: 'priorityBranch',
      title: 'High or urgent priority',
      description:
        'Branches on whether the work order priority is high or urgent. The yes branch records the urgent acceptance note and notifies the supervisor or the engineer; the no branch records the ordinary acceptance note.',
      config: {
        expression: {
          in: [
            { var: 'nodeResults.registerAcceptance.priority' },
            ['high', 'urgent'],
          ],
        },
      },
    }).branch({
      yes: [
        RunInstruction.create({
          key: 'recordUrgentAcceptance',
          title: 'Record urgent acceptance note',
          description:
            'Writes the urgent acceptance note on the work order unless the order had already been processed before this run.',
          config: {
            module: './server/record-acceptance-note',
            args: {
              workOrderId: '{{$input.workOrderId}}',
              accepted: '{{$nodeResults.registerAcceptance.accepted}}',
              alreadyProcessed:
                '{{$nodeResults.registerAcceptance.alreadyProcessed}}',
              priority: '{{$nodeResults.registerAcceptance.priority}}',
              locale: '{{$input.locale}}',
            },
          },
          result: {
            type: 'object',
            required: ['noted'],
            properties: { noted: { type: 'boolean' } },
            additionalProperties: false,
          },
        }),
      ],
      no: [
        RunInstruction.create({
          key: 'recordNormalAcceptance',
          title: 'Record ordinary acceptance note',
          description:
            'Writes the ordinary acceptance note on the work order unless the order had already been processed before this run.',
          config: {
            module: './server/record-acceptance-note',
            args: {
              workOrderId: '{{$input.workOrderId}}',
              accepted: '{{$nodeResults.registerAcceptance.accepted}}',
              alreadyProcessed:
                '{{$nodeResults.registerAcceptance.alreadyProcessed}}',
              priority: '{{$nodeResults.registerAcceptance.priority}}',
              locale: '{{$input.locale}}',
            },
          },
          result: {
            type: 'object',
            required: ['noted'],
            properties: { noted: { type: 'boolean' } },
            additionalProperties: false,
          },
        }),
      ],
    }),
    RunInstruction.create({
      key: 'notifyResponsible',
      title: 'Notify the responsible person',
      description:
        'Sends one durable in-app message to the engineer who owns the work order, or to the supervisor when an escalated order still waits for acceptance. A processed-later run sends nothing.',
      config: {
        module: './server/notify-responsible',
        args: {
          workOrderId: '{{$input.workOrderId}}',
          accepted: '{{$nodeResults.registerAcceptance.accepted}}',
          escalated: '{{$nodeResults.registerAcceptance.escalated}}',
          alreadyProcessed:
            '{{$nodeResults.registerAcceptance.alreadyProcessed}}',
          assigneeId: '{{$nodeResults.registerAcceptance.assigneeId}}',
          supervisorId: '{{$nodeResults.registerAcceptance.supervisorId}}',
          code: '{{$nodeResults.registerAcceptance.code}}',
          title: '{{$nodeResults.registerAcceptance.title}}',
          locale: '{{$input.locale}}',
        },
      },
      result: {
        type: 'object',
        required: ['notified'],
        properties: { notified: { type: 'boolean' } },
        additionalProperties: false,
      },
    }),
  ],
});

export default workflow;
