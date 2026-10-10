import {
  Type,
  createRunInstruction,
  defineHandler,
  workflow,
  type ContextOf,
  type WorkflowSourceAst,
} from '@nocobase/app-plugin-workflow';

import type { run as acceptOrder } from './server/accept-order';
import type { run as notifyAcceptance } from './server/notify-acceptance';

/**
 * Accepts a service order and reports the outcome.
 *
 * The transition itself is a guarded database update, so triggering this
 * workflow twice for the same order is harmless. It is triggered from the
 * order-create route (automatic acceptance) and from the manual accept route
 * (supervisor acceptance of a confidential order), and the HTTP route calls the
 * same transition directly when a trigger is skipped because the workflow is
 * not enabled.
 */
const flow = workflow({
  key: 'order-acceptance',
  title: 'Service order acceptance',
  description:
    'Accepts a service order by moving it from pending acceptance to pending processing, assigns the device engineer, records an audit entry and notifies the assignee or the supervisors. The transition is idempotent and status-guarded, so a repeated trigger never accepts the same order twice.',
  input: {
    schema: Type.Object({
      orderId: Type.Number({ title: 'Order id' }),
      manual: Type.Boolean({ title: 'Manual acceptance' }),
      actorId: Type.Union([Type.String(), Type.Null()], {
        title: 'Acting user',
      }),
      acceptanceNote: Type.Optional(
        Type.Union([Type.String(), Type.Null()], { title: 'Acceptance note' }),
      ),
      eventKey: Type.Union([Type.String(), Type.Null()], {
        title: 'Idempotency key',
      }),
    }),
  },
})
  .addNode(
    createRunInstruction({
      key: 'acceptOrder',
      title: 'Accept order',
      description:
        'Resolve the database connection and run the shared acceptance transition: assign the device engineer and group, move the order to pending processing and append an audit log entry. An order that is no longer pending acceptance, or a confidential order on the automatic path, is reported back without being changed.',
    }).run(defineHandler<typeof acceptOrder>('./server/accept-order')),
  )
  .addNode(
    createRunInstruction({
      key: 'notifyAcceptance',
      title: 'Notify acceptance',
      description:
        'Read the acceptance result and send one in-app notification: to the assignee when the order was accepted, otherwise to the users holding the service.supervisor permission set. Skipped deliveries and a missing notification service are reported as an outcome rather than failing the run.',
    }).run(
      defineHandler<typeof notifyAcceptance>('./server/notify-acceptance'),
    ),
  );

export interface FlowContext {
  input: ContextOf<typeof flow>['input'];
  parameters: ContextOf<typeof flow>['parameters'];
  nodeResults: ContextOf<typeof flow>['nodeResults'];
}

const definition: WorkflowSourceAst = flow.finalize();
export default definition;
