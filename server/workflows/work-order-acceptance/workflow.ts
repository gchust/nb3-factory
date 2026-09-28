import {
  ConditionInstruction,
  defineWorkflow,
  RunInstruction,
  type WorkflowSourceAst,
} from '@nocobase/app-plugin-workflow';

/**
 * Work order acceptance.
 *
 * The router branches on priority so an urgent report and a normal one take
 * separate paths to the same assignee step, and a notification is sent once
 * per work order no matter how many times the event is delivered.
 */
const workflow: WorkflowSourceAst = defineWorkflow({
  title: '工单受理',
  description:
    '受理新提交的售后工单：加急工单与普通工单分别流转，但都进入同一负责人处理环节并通知负责人。最新变更：按工单 id 幂等下发受理通知。',
  inputSchema: {
    type: 'object',
    required: ['workOrderId', 'priority'],
    properties: {
      workOrderId: { type: 'string', minLength: 1 },
      priority: { type: 'string', enum: ['normal', 'urgent'] },
    },
    additionalProperties: false,
  },
  nodes: [
    ConditionInstruction.create({
      key: 'isUrgent',
      description:
        '判断工单优先级是否为加急。加急工单走高优先分支，普通工单走常规分支，两者随后都执行受理并通知负责人。',
      config: {
        expression: { '===': [{ var: 'input.priority' }, 'urgent'] },
      },
    }).branch({
      yes: [
        RunInstruction.create({
          key: 'acceptUrgent',
          description:
            '受理加急工单：将状态推进到待处理、记录受理时间，并按工单 id 幂等地通知负责人。',
          config: {
            module: './server/accept-order',
            args: {
              workOrderId: '{{$input.workOrderId}}',
              priority: 'urgent',
            },
          },
        }),
      ],
      no: [
        RunInstruction.create({
          key: 'acceptNormal',
          description:
            '受理普通工单：将状态推进到待处理、记录受理时间，并按工单 id 幂等地通知负责人。',
          config: {
            module: './server/accept-order',
            args: {
              workOrderId: '{{$input.workOrderId}}',
              priority: 'normal',
            },
          },
        }),
      ],
    }),
  ],
});

export default workflow;
