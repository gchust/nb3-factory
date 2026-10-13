import { useOutletContext } from 'react-router';
import type { ReactElement } from 'react';

import { TransitionDialog } from '../transitions.js';
import type { TicketDetailOutletContext } from '../types.js';

/** `/tickets/:ticketId/return` — the requester says the issue is not fixed and sends it back for more work. */
export default function ReturnTicketDialog(): ReactElement {
  const { ticketId, version, reload } =
    useOutletContext<TicketDetailOutletContext>();
  return (
    <TransitionDialog
      transition='return'
      ticketId={ticketId}
      version={version}
      reload={reload}
    />
  );
}
