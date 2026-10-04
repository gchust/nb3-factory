import {
  ConditionInstruction,
  defineWorkflow,
  RunInstruction,
  type WorkflowSourceAst,
} from '@nocobase/app-plugin-workflow';

/**
 * 主管受理工单后的登记流程。
 *
 * The application's ticket service hands a pending ticket to this workflow
 * (`ticket-acceptance`) through `workflowServiceToken.trigger` instead of
 * accepting it inline. The workflow registers the acceptance itself: it picks
 * the note wording from the priority branch, assigns the responsible service
 * engineer, writes the acceptance note on the ticket, appends the audit event
 * and notifies the engineer. Until the terminal node runs, the ticket stays
 * `pending`, so the screen can show "受理中" rather than pretending the
 * hand-off is the completed business result.
 *
 * The registration is idempotent, so a retried node or a repeated invocation
 * for the same ticket cannot accept twice or send the same message twice.
 */
const workflow: WorkflowSourceAst = defineWorkflow({
  title: '设备售后工单受理',
  description:
    '主管提交受理后，按工单优先级选择普通/紧急分支，指派服务工程师、写入受理说明并发送站内提醒，最后返回可核对的受理结果。',
  inputSchema: {
    type: 'object',
    required: ['ticketId', 'actorId', 'priority'],
    properties: {
      ticketId: { type: 'integer', minimum: 1 },
      actorId: { type: 'string', minLength: 1 },
      priority: {
        type: 'string',
        enum: ['low', 'normal', 'high', 'urgent'],
      },
    },
    additionalProperties: false,
  },
  nodes: [
    ConditionInstruction.create({
      key: 'isUrgent',
      title: '是否紧急工单',
      description:
        '按工单优先级判断是否走紧急受理分支：urgent 走紧急说明，其余走普通说明。',
      config: {
        expression: { '===': [{ var: 'input.priority' }, 'urgent'] },
      },
    }).branch({
      yes: [
        RunInstruction.create({
          key: 'urgentAcceptance',
          title: '紧急受理登记',
          description:
            '指派服务工程师、写入 4 小时响应的加急受理说明、登记受理事件并通知工程师。',
          config: {
            module: './server/urgent-acceptance',
            args: {
              ticketId: '{{$input.ticketId}}',
              actorId: '{{$input.actorId}}',
            },
          },
          result: {
            type: 'object',
            required: [
              'ticketId',
              'ticketNo',
              'status',
              'assigneeId',
              'assigneeName',
              'note',
            ],
            properties: {
              ticketId: { type: 'integer' },
              ticketNo: { type: 'string' },
              status: { type: 'string' },
              assigneeId: { oneOf: [{ type: 'integer' }, { type: 'null' }] },
              assigneeName: { oneOf: [{ type: 'string' }, { type: 'null' }] },
              note: { type: 'string' },
            },
            additionalProperties: false,
          },
        }),
      ],
      no: [
        RunInstruction.create({
          key: 'standardAcceptance',
          title: '普通受理登记',
          description:
            '指派服务工程师、写入普通受理说明、登记受理事件并通知工程师。',
          config: {
            module: './server/standard-acceptance',
            args: {
              ticketId: '{{$input.ticketId}}',
              actorId: '{{$input.actorId}}',
            },
          },
          result: {
            type: 'object',
            required: [
              'ticketId',
              'ticketNo',
              'status',
              'assigneeId',
              'assigneeName',
              'note',
            ],
            properties: {
              ticketId: { type: 'integer' },
              ticketNo: { type: 'string' },
              status: { type: 'string' },
              assigneeId: { oneOf: [{ type: 'integer' }, { type: 'null' }] },
              assigneeName: { oneOf: [{ type: 'string' }, { type: 'null' }] },
              note: { type: 'string' },
            },
            additionalProperties: false,
          },
        }),
      ],
    }),
  ],
});

export default workflow;
