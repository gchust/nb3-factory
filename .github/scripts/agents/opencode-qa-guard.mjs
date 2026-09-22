import { isProcessTerminationCommand, QA_PROCESS_GUARD_REASON } from './qa-guard-rules.mjs';

export const FactoryQaGuard = async () => ({
  'tool.execute.before': async (input, output) => {
    if (input.tool === 'bash' && isProcessTerminationCommand(output.args?.command)) {
      throw new Error(QA_PROCESS_GUARD_REASON);
    }
  },
});
