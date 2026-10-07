import {
  Type,
  createConditionInstruction,
  createRunInstruction,
  defineHandler,
  workflow,
  type ContextOf,
} from '@nocobase/app-plugin-workflow';

import type { run as acceptNormal } from './server/accept-normal';
import type { run as acceptUrgent } from './server/accept-urgent';
import type { run as isUrgent } from './server/is-urgent';

/**
 * Automatic and audited acceptance of a work order.
 *
 * The application service still owns creating an order and every manual state
 * transition; this workflow records the *decision* that acceptance makes about
 * an order and, for an urgent order, performs the assignment itself:
 *
 * - an urgent order that is still 待受理 is assigned to the least-loaded active
 *   engineer and moved to 待处理 (`acceptUrgent`);
 * - a normal order, or an urgent one a supervisor already accepted by hand, is
 *   audited without a second write (`acceptNormal`).
 *
 * The branch an order takes is therefore readable from its priority, which is
 * what the run record explains. The route triggers it with a stable event key
 * per order, so re-sending an acceptance never starts a second run.
 */
const flow = workflow({
  key: 'work-order-acceptance',
  title: 'Work order acceptance',
  description:
    'Decides how an acceptance is fulfilled: an urgent order is auto-assigned and moved to 待处理; a normal order is recorded for a supervisor to accept by hand.',
  input: {
    schema: Type.Object({
      workOrderId: Type.String(),
      orderNo: Type.String(),
      priority: Type.Union([Type.Literal('urgent'), Type.Literal('normal')]),
    }),
  },
})
  .addNode(
    createConditionInstruction({
      key: 'isUrgent',
      title: 'Urgent order?',
      description:
        'Urgent orders are accepted automatically; normal orders wait for a supervisor.',
    })
      .check(defineHandler<typeof isUrgent>('./server/is-urgent'))
      .yes([
        createRunInstruction({
          key: 'acceptUrgent',
          title: 'Accept and assign the urgent order',
        }).run(defineHandler<typeof acceptUrgent>('./server/accept-urgent')),
      ])
      .no([
        createRunInstruction({
          key: 'acceptNormal',
          title: 'Record the normal acceptance',
        }).run(defineHandler<typeof acceptNormal>('./server/accept-normal')),
      ]),
  )
  .finalize();

/** The whole workflow context, including every node result, as the handlers see it. */
export type FlowContext = ContextOf<typeof flow>;

// The build evaluates this module and serializes its default export, so the
// definition itself is what the source package publishes.
export default flow;
