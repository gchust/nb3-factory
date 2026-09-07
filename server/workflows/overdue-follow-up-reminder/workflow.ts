import {
  defineWorkflow,
  RunInstruction,
  type WorkflowSourceAst,
  type WorkflowSourceInput,
} from '@nocobase/app-plugin-workflow';

/**
 * Daily reminder for overdue follow-ups. Triggered by the cron scheduler with
 * eventKey `overdue-reminder:<date>`; the run script records one row per
 * (followUp, date) in `followUpReminders` so each overdue follow-up is
 * reminded at most once per day.
 */
const workflow: WorkflowSourceAst = defineWorkflow({
  title: 'Overdue follow-up reminder',
  description: 'Reminds sales people of follow-ups that are overdue.',
  inputSchema: {
    type: 'object',
    required: ['date'],
    properties: {
      date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    },
    additionalProperties: false,
  },
  nodes: [
    RunInstruction.create({
      key: 'notifyOverdueFollowUps',
      title: 'Notify overdue follow-ups',
      config: {
        module: './server/notify-overdue-follow-ups',
        args: {
          date: '{{$input.date}}',
        },
      },
    }),
  ],
} satisfies WorkflowSourceInput);

export default workflow;
