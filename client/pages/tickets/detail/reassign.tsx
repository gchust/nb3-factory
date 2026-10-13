import { useOutletContext } from 'react-router';
import type { ReactElement } from 'react';

import { TransitionDialog } from '../transitions.js';
import type { TicketDetailOutletContext } from '../types.js';

/** `/tickets/:ticketId/reassign` — the service desk hands a returned ticket to an engineer again. */
export default function ReassignTicketDialog(): ReactElement {
  const { ticketId, version, reload } =
    useOutletContext<TicketDetailOutletContext>();
  return (
    <TransitionDialog
      transition='reassign'
      ticketId={ticketId}
      version={version}
      reload={reload}
    />
  );
}
