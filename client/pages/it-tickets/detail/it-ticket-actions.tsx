import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useTranslation } from '@nocobase/i18n/client';
import { CheckIcon, PlayIcon } from 'lucide-react';
import { type ReactElement, useState } from 'react';
import { Link, useLocation } from 'react-router';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

import { startItTicket } from '../it-ticket-api.js';
import { ticketErrorMessage } from '../it-ticket-errors.js';
import { IT_TICKETS_PAGE_ID, type ItTicket } from '../types.js';

export interface ItTicketDetailActionsProps {
  readonly ticket: ItTicket;
  /** Called on success with the record the endpoint returned. */
  readonly onUpdated: (ticket: ItTicket) => void;
  /** Called when the ticket no longer exists, or is no longer visible. */
  readonly onGone: () => void;
  /** Called when the transition was refused: the record is shown again from the server. */
  readonly onRefresh: () => void;
}

/**
 * The record actions at the bottom of the drawer.
 *
 * Both are granted actions, so each is shown only when the account holds it;
 * the server enforces the same rule, so hiding a button is a courtesy rather
 * than the boundary. Starting is a single click; completing asks for the
 * resolution note and opens as the drawer's `complete` child route.
 */
export function ItTicketDetailActions({
  ticket,
  onUpdated,
  onGone,
  onRefresh,
}: ItTicketDetailActionsProps): ReactElement | null {
  const { t } = useTranslation();
  const location = useLocation();
  const startAccess = useCan({
    resource: { type: 'composite', id: IT_TICKETS_PAGE_ID },
    action: 'start',
  });
  const completeAccess = useCan({
    resource: { type: 'composite', id: IT_TICKETS_PAGE_ID },
    action: 'complete',
  });

  // A finished ticket is locked: neither transition is offered again, for
  // anyone. The server refuses both regardless.
  const canStart = startAccess.can && ticket.status === 'pending';
  const canComplete = completeAccess.can && ticket.status === 'processing';

  if (!canStart && !canComplete) {
    return null;
  }

  return (
    <>
      {canStart ? (
        <StartItTicketButton
          ticket={ticket}
          onUpdated={onUpdated}
          onGone={onGone}
          onRefresh={onRefresh}
        />
      ) : null}
      {canComplete ? (
        <Button
          nativeButton={false}
          render={
            <Link to={{ pathname: 'complete', search: location.search }} />
          }
        >
          <CheckIcon data-icon='inline-start' />
          {t('itTickets.complete.action')}
        </Button>
      ) : null}
    </>
  );
}

/**
 * "Start handling": one click moves the ticket to `processing` and records the
 * handler from the session, with no form and no confirmation.
 */
function StartItTicketButton({
  ticket,
  onUpdated,
  onGone,
  onRefresh,
}: {
  readonly ticket: ItTicket;
  readonly onUpdated: (ticket: ItTicket) => void;
  readonly onGone: () => void;
  readonly onRefresh: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const { refresh } = useAuthentication();
  const [pending, setPending] = useState(false);

  async function start(): Promise<void> {
    setPending(true);
    try {
      const updated = await startItTicket(api, ticket.id);
      // No success toast here: the shared toast viewport sits over the drawer's
      // footer, where this button and its successor live. The badge, the handler
      // and the footer itself all change, which says the same thing without
      // covering the next button.
      onUpdated(updated);
    } catch (error: unknown) {
      // There is no dialog to hold an error, so it goes to a toast.
      if (error instanceof ApiClientError && error.status === 401) {
        // The session ended: offer to sign in again, and let the user choose
        // when, since refreshing blanks the signed-in pages.
        toaster.show({
          type: 'error',
          title: t('itTickets.error.sessionExpired'),
          action: {
            label: t('itTickets.error.signInAgain'),
            onClick: () => void refresh(),
          },
        });
      } else if (error instanceof ApiClientError && error.status === 404) {
        toaster.show({ type: 'error', title: t('itTickets.error.notFound') });
        onGone();
      } else if (error instanceof ApiClientError && error.status === 403) {
        toaster.show({ type: 'error', title: t('itTickets.error.forbidden') });
        onRefresh();
      } else {
        // A refused transition (somebody else handled it first) and a network
        // failure both land here; the wording is chosen from the reason code.
        toaster.show({
          type: 'error',
          title: ticketErrorMessage(t, error),
        });
        onRefresh();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant='outline' disabled={pending} onClick={() => void start()}>
      {pending ? (
        <Spinner data-icon='inline-start' />
      ) : (
        <PlayIcon data-icon='inline-start' />
      )}
      {t('itTickets.start.action')}
    </Button>
  );
}
