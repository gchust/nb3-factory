import {
  ConditionInstruction,
  defineWorkflow,
  RunInstruction,
  type WorkflowSourceAst,
} from '@nocobase/app-plugin-workflow';

/**
 * Driver's-seat intake acceptance for a service order.
 *
 * Latest change: initial definition. It loads the order, branches on urgency so
 * each branch writes the matching acceptance note, then lets the supervisor see
 * the run's steps and result in Workflow management.
 */
const workflow: WorkflowSourceAst = defineWorkflow({
  title: '服务工单登记受理 / Service order intake acceptance',
  description:
    '受理一张待受理的服务工单：读取工单与优先级，按普通/紧急分支写入对应受理说明，把工单推进到待处理并发送负责人站内消息。',
  inputSchema: {
    type: 'object',
    required: ['orderId', 'operatorId'],
    properties: {
      orderId: { type: 'number' },
      operatorId: { type: 'string' },
    },
    additionalProperties: false,
  },
  nodes: [
    RunInstruction.create({
      key: 'loadOrder',
      title: '载入工单',
      description:
        '按工单编号读取工单当前状态、优先级、负责人和保密标记，作为受理分支与幂等判断的依据。',
      config: {
        module: './server/load-order',
        args: { orderId: '{{$input.orderId}}' },
      },
      result: {
        type: 'object',
        required: [
          'orderId',
          'status',
          'priority',
          'assigneeProfileId',
          'confidential',
        ],
        properties: {
          orderId: { type: 'number' },
          status: { type: 'string' },
          priority: { type: 'string' },
          assigneeProfileId: { oneOf: [{ type: 'number' }, { type: 'null' }] },
          confidential: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    }),
    ConditionInstruction.create({
      key: 'isUrgent',
      description:
        '比较工单优先级是否为紧急；紧急走紧急受理说明分支，其余走普通受理说明分支。',
      config: {
        expression: {
          '===': [{ var: 'nodeResults.loadOrder.priority' }, 'urgent'],
        },
      },
    }).branch({
      yes: [
        RunInstruction.create({
          key: 'acceptUrgent',
          description:
            '以紧急受理说明将工单从待受理推进到待处理，写入受理记录并给负责人发送站内消息；已受理时保持幂等。',
          config: {
            module: './server/accept-order',
            args: {
              orderId: '{{$input.orderId}}',
              operatorId: '{{$input.operatorId}}',
              note: '紧急工单：2 小时内联系客户并优先派工。',
            },
          },
          result: {
            type: 'object',
            required: ['accepted', 'status'],
            properties: {
              accepted: { type: 'boolean' },
              status: { type: 'string' },
            },
            additionalProperties: true,
          },
        }),
      ],
      no: [
        RunInstruction.create({
          key: 'acceptNormal',
          description:
            '以普通受理说明将工单从待受理推进到待处理，写入受理记录并给负责人发送站内消息；已受理时保持幂等。',
          config: {
            module: './server/accept-order',
            args: {
              orderId: '{{$input.orderId}}',
              operatorId: '{{$input.operatorId}}',
              note: '普通工单：按标准流程安排常规处理。',
            },
          },
          result: {
            type: 'object',
            required: ['accepted', 'status'],
            properties: {
              accepted: { type: 'boolean' },
              status: { type: 'string' },
            },
            additionalProperties: true,
          },
        }),
      ],
    }),
  ],
});

export default workflow;
