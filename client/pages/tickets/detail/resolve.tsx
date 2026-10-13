import { useOutletContext } from 'react-router';
import type { ReactElement } from 'react';

import { TransitionDialog } from '../transitions.js';
import type { TicketDetailOutletContext } from '../types.js';

/** `/tickets/:ticketId/resolve` — the assigned engineer records what fixed it and asks the requester to confirm. */
export default function ResolveTicketDialog(): ReactElement {
  const { ticketId, version, reload } =
    useOutletContext<TicketDetailOutletContext>();
  return (
    <TransitionDialog
      transition='resolve'
      ticketId={ticketId}
      version={version}
      reload={reload}
    />
  );
}
