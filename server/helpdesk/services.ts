import { randomUUID } from 'node:crypto';
import type { DatabaseConnection } from '@nocobase/db';
import type { ServiceContainer } from '@nocobase/service-provider';
import { i18nToken } from '@nocobase/app-server/i18n';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { HelpdeskLifecycleServices } from '../lifecycles/helpdesk-ticket.js';

const APP_NAMESPACE = 'nb3-factory';

type Translate = (
  key: string,
  options?: Readonly<Record<string, unknown>>,
) => string;

/**
 * Builds the lifecycle's services. `connection` is either the root connection
 * (effects, which run after commit) or the transaction handle lifecycle passes
 * to guards and transition hooks, so a comment commits with its transition.
 */
export function createHelpdeskLifecycleServices(options: {
  readonly container: ServiceContainer;
  readonly connection: DatabaseConnection;
}): HelpdeskLifecycleServices {
  const { container, connection } = options;

  const translate = (): Translate => {
    const i18n = container.resolve(i18nToken);
    return i18n.getFixedT(APP_NAMESPACE, i18n.getDefaultLocale());
  };

  return {
    helpdesk: {
      async addComment(input) {
        const now = new Date().toISOString();
        await connection.repository('helpdeskComments').createOne({
          values: {
            id: randomUUID(),
            ticketId: input.ticketId,
            authorId: input.authorId,
            kind: input.kind,
            body: input.body,
            createdAt: now,
          },
        });
      },

      async notify(input) {
        if (!input.recipients.length) return;
        const t = translate();
        const title = t(input.titleKey, {
          ...input.variables,
          defaultValue: input.titleKey,
        });
        const body = t(input.bodyKey, {
          ...input.variables,
          defaultValue: input.bodyKey,
        });
        const notification = container.resolve(notificationServiceToken);
        await notification.send({
          idempotencyKey: input.idempotencyKey,
          source: input.source,
          messages: {
            inbox: {
              to: [...input.recipients],
              title,
              body,
              target: { type: 'route', path: input.path },
            },
          },
        });
      },

      async serviceDeskRecipientIds() {
        const authz = container.resolve(authorizationToken);
        const assignments = await authz.permissionSets.listAssignments(
          'helpdesk-service-desk',
        );
        return [
          ...new Set(
            assignments
              .filter(
                (assignment) =>
                  assignment.subject.type.toLowerCase() === 'user' &&
                  assignment.subject.id,
              )
              .map((assignment) => String(assignment.subject.id)),
          ),
        ];
      },
    },
  };
}
