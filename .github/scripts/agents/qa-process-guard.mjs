// QA owns browser interactions, while the supervisor owns process lifecycles.
// In particular, pkill -f agent-browser also matches Pi's prompt/log paths.
// This tool preflight prevents accidental process termination; it is not an
// operating-system sandbox for arbitrary untrusted programs.
export default function registerQaProcessGuard(pi) {
  pi.on('tool_call', (event) => {
    if (event.toolName !== 'bash') return;
    const command = String(event.input?.command ?? '');
    if (
      /(?:^|[^\w-])(?:pkill|killall|kill|fuser)(?=$|[\s;'"])/u.test(command)
    ) {
      return {
        block: true,
        reason:
          'QA must not terminate processes. Use agent-browser close followed by agent-browser open in the existing session, then authenticate and snapshot again. If browser input still fails, record the failure and return control to the factory supervisor.',
      };
    }
  });
}
