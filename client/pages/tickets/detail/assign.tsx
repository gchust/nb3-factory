import { useOutletContext } from 'react-router';
import type { ReactElement } from 'react';

import { TransitionDialog } from '../transitions.js';
import type { TicketDetailOutletContext } from '../types.js';

/** `/tickets/:ticketId/assign` — the service desk hands the ticket to an engineer. */
export default function AssignTicketDialog(): ReactElement {
  const { ticketId, version, reload } =
    useOutletContext<TicketDetailOutletContext>();
  return (
    <TransitionDialog
      transition='assign'
      ticketId={ticketId}
      version={version}
      reload={reload}
    />
  );
}
