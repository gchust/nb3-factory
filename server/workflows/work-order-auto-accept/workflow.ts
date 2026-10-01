import {
  ConditionInstruction,
  defineWorkflow,
  RunInstruction,
  type WorkflowSourceAst,
} from '@nocobase/app-plugin-workflow';

// The supervisor accepts a work order in the application service (the state
// change itself stays in ordinary typed code, as required). The service then
// triggers this workflow, which registers the acceptance note for the priority
// branch and notifies the assignee through persistent in-app messaging.
//
// The directory name `work-order-auto-accept` is the stable workflow key that
// `server/services/automation.ts` triggers. Do not rename it without updating
// that key.
const workflow: WorkflowSourceAst = defineWorkflow({
  title: '工单自动受理',
  description:
    '受理工单后按普通/紧急分支登记受理说明，并向负责人发送站内消息。',
  inputSchema: {
    type: 'object',
    required: ['workOrderId', 'attempt'],
    properties: {
      workOrderId: { type: 'string', minLength: 1 },
      attempt: { type: 'number', minimum: 0 },
    },
    additionalProperties: false,
  },
  nodes: [
    RunInstruction.create({
      key: 'loadContext',
      description: '读取工单编号、优先级、状态与负责人，供分支和通知使用。',
      title: '读取工单上下文',
      config: {
        module: './server/load-context',
        args: { workOrderId: '{{$input.workOrderId}}' },
      },
      result: {
        type: 'object',
        required: ['id', 'code', 'priority', 'status'],
        properties: {
          id: { type: 'string' },
          code: { type: 'string' },
          priority: { type: 'string' },
          status: { type: 'string' },
          assigneeId: {
            oneOf: [{ type: 'string' }, { type: 'null' }],
          },
        },
        additionalProperties: false,
      },
    }),
    ConditionInstruction.create({
      key: 'isUrgent',
      description: '优先级为 urgent 时走紧急分支，否则走普通分支。',
      config: {
        expression: {
          '===': [{ var: 'nodeResults.loadContext.priority' }, 'urgent'],
        },
      },
    }).branch({
      yes: [
        RunInstruction.create({
          key: 'registerUrgent',
          description: '为紧急工单登记对应的受理说明。',
          config: {
            module: './server/register-acceptance',
            args: {
              workOrderId: '{{$input.workOrderId}}',
              note: '紧急工单，已优先受理，请尽快联系客户处理。',
            },
          },
        }),
        RunInstruction.create({
          key: 'notifyUrgent',
          description: '向负责人发送紧急工单受理的站内消息。',
          config: {
            module: './server/send-notice',
            args: {
              workOrderId: '{{$input.workOrderId}}',
              recipientId: '{{$nodeResults.loadContext.assigneeId}}',
              title: '紧急工单已受理',
              body: '您的紧急工单已受理，请尽快处理。',
              keySuffix: 'urgent',
            },
          },
        }),
      ],
      no: [
        RunInstruction.create({
          key: 'registerNormal',
          description: '为普通工单登记对应的受理说明。',
          config: {
            module: './server/register-acceptance',
            args: {
              workOrderId: '{{$input.workOrderId}}',
              note: '普通工单已受理，请按计划处理。',
            },
          },
        }),
        RunInstruction.create({
          key: 'notifyNormal',
          description: '向负责人发送普通工单受理的站内消息。',
          config: {
            module: './server/send-notice',
            args: {
              workOrderId: '{{$input.workOrderId}}',
              recipientId: '{{$nodeResults.loadContext.assigneeId}}',
              title: '工单已受理',
              body: '您的工单已受理，请按计划处理。',
              keySuffix: 'normal',
            },
          },
        }),
      ],
    }),
    RunInstruction.create({
      key: 'recordOutcome',
      description: '汇总本次受理自动化的结果，便于在运行记录中核对。',
      title: '记录受理结果',
      config: {
        module: './server/record-outcome',
        args: {
          workOrderId: '{{$input.workOrderId}}',
          code: '{{$nodeResults.loadContext.code}}',
          priority: '{{$nodeResults.loadContext.priority}}',
        },
      },
    }),
  ],
});

export default workflow;
