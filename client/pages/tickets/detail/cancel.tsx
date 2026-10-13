import { useOutletContext } from 'react-router';
import type { ReactElement } from 'react';

import { TransitionDialog } from '../transitions.js';
import type { TicketDetailOutletContext } from '../types.js';

/** `/tickets/:ticketId/cancel` — the requester or the service desk abandons a ticket that is no longer needed. */
export default function CancelTicketDialog(): ReactElement {
  const { ticketId, version, reload } =
    useOutletContext<TicketDetailOutletContext>();
  return (
    <TransitionDialog
      transition='cancel'
      ticketId={ticketId}
      version={version}
      reload={reload}
    />
  );
}
