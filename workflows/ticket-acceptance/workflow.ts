import {
  Type,
  createConditionInstruction,
  createRunInstruction,
  defineHandler,
  workflow,
  type ContextOf,
  type WorkflowSourceAst,
} from '@nocobase/app-plugin-workflow';
import type { run as applyAcceptance } from './server/apply-acceptance';
import type { run as decideAcceptance } from './server/decide-acceptance';
import type { run as loadTicket } from './server/load-ticket';
import type { run as recordRejection } from './server/record-rejection';

/**
 * Ticket acceptance. A submitted ticket is loaded, the acceptance decision is
 * evaluated, and the outcome is applied or recorded as a durable, retryable
 * failure step. This workflow is the source-managed owner of the acceptance
 * transition; the application only triggers it and reads back the result.
 */
const flow = workflow({
  key: 'ticket-acceptance',
  title: 'Service ticket acceptance',
  description:
    'Accepts or refuses a service ticket that waits for acceptance, assigns its owner, and records every attempt.',
  input: {
    schema: Type.Object({
      ticketId: Type.Number(),
      ticketNo: Type.String(),
      actorId: Type.String(),
      actorName: Type.String(),
      accept: Type.Boolean(),
      ownerId: Type.Optional(Type.String()),
      priority: Type.String(),
      reason: Type.Optional(Type.String()),
    }),
  },
})
  .addNode(
    createRunInstruction({
      key: 'loadTicket',
      title: 'Load ticket',
      description:
        'Read the ticket by id and report whether it exists, its current status, number and owner; a missing ticket becomes data for the failure branch instead of an error.',
    }).run(defineHandler<typeof loadTicket>('./server/load-ticket')),
  )
  .addNode(
    createConditionInstruction({
      key: 'decideAcceptance',
      title: 'Decide acceptance',
      description:
        'Accept only when the ticket exists, still waits for acceptance and the request asked to accept it; otherwise take the branch that records the refusal or the impossible acceptance.',
    })
      .check(
        defineHandler<typeof decideAcceptance>('./server/decide-acceptance'),
      )
      .yes([
        createRunInstruction({
          key: 'applyAcceptance',
          title: 'Apply acceptance',
          description:
            'Move the ticket to pending handling, set its owner and priority, stamp the accepted time, and write the ticket log plus the owner notification.',
        }).run(
          defineHandler<typeof applyAcceptance>('./server/apply-acceptance'),
        ),
      ])
      .no([
        createRunInstruction({
          key: 'recordRejection',
          title: 'Record refusal',
          description:
            'Close the ticket with the refusal reason when acceptance was explicitly refused, or leave a retryable failure step when the ticket was missing or had already moved on.',
        }).run(
          defineHandler<typeof recordRejection>('./server/record-rejection'),
        ),
      ]),
  );

export interface FlowContext {
  input: ContextOf<typeof flow>['input'];
  parameters: ContextOf<typeof flow>['parameters'];
  nodeResults: ContextOf<typeof flow>['nodeResults'];
}

const definition: WorkflowSourceAst = flow.finalize();
export default definition;
