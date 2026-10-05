/**
 * Durable record of a supervisor's acceptance of a repair work order.
 *
 * A supervisor accepts a work order synchronously, and the application writes
 * the acceptance note and notifies the assigned engineer in that same
 * operation (`ServiceOperations.runAcceptance`), so the effect never depends on
 * a Workflow run. This Workflow is the durable, source-managed consumer of the
 * acceptance event: it records the acceptance and routes on the order's
 * priority, so the Workflow UI shows per run whether an urgent or a normal
 * order was accepted. The definition is source-managed: this directory's name
 * is the stable workflow key, and the provider materializes and enables the
 * committed digest at boot.
 *
 * The nodes are deliberately core-only, with no `RunInstruction` module. A run
 * module executes from the immutable Artifact copy in production, where a
 * relative import of an application-owned service escapes the package and
 * cannot resolve; keeping the business effect in the application and the
 * routing in the definition keeps the Artifact self-contained.
 */
import {
  ConditionInstruction,
  defineWorkflow,
  TerminateInstruction,
  type WorkflowSourceAst,
} from '@nocobase/app-plugin-workflow';

const workflow: WorkflowSourceAst = defineWorkflow({
  title: 'Work order automatic acceptance',
  description:
    'Durably records a supervisor acceptance and routes on the order priority. Latest change: the application writes the acceptance note, so the definition carries no run module.',
  inputSchema: {
    type: 'object',
    required: ['workOrderId', 'orderNo', 'priority'],
    properties: {
      workOrderId: { type: 'integer', minimum: 1 },
      orderNo: { type: 'string' },
      title: { type: 'string' },
      priority: { type: 'string', enum: ['normal', 'urgent'] },
      assigneeId: { type: ['integer', 'null'] },
      assigneeUserId: { type: ['string', 'null'] },
      assigneeName: { type: ['string', 'null'] },
      customerName: { type: ['string', 'null'] },
      equipmentName: { type: ['string', 'null'] },
      deadline: { type: ['string', 'null'] },
    },
    additionalProperties: false,
  },
  nodes: [
    ConditionInstruction.create({
      key: 'priorityRouting',
      description:
        'Route an urgent work order to the expedited acceptance note and a normal one to the standard note; both branches write the same acceptance state.',
      config: {
        expression: { '===': [{ var: 'input.priority' }, 'urgent'] },
      },
    }).branch({
      yes: [
        TerminateInstruction.create({
          key: 'acceptUrgent',
          description:
            'End the run, recording that an urgent work order was accepted.',
          config: { outcome: 'success' },
        }),
      ],
      no: [
        TerminateInstruction.create({
          key: 'acceptNormal',
          description:
            'End the run, recording that a normal work order was accepted.',
          config: { outcome: 'success' },
        }),
      ],
    }),
  ],
});

export default workflow;
