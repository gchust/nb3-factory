import type { AuthEnv } from '@nocobase/app-plugin-authentication/server';
import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';
import {
  FILE_COLUMNS,
  defineFileRepositoryApiRoutes,
} from '@nocobase/app-plugin-file/server';
import type { Context } from 'hono';

/**
 * Screenshot uploads for IT tickets.
 *
 * Uploads are authenticated by the provider's scoped middleware on `/api/itTicketFiles/*`.
 * The upload Policy stamps the caller's user id, so a later create can claim only the
 * attachments that user uploaded. The service then binds `ticketId` in the same
 * transaction that creates the ticket.
 */
export const itTicketFileRoutes: readonly AppRouteContribution<Application>[] =
  defineFileRepositoryApiRoutes({
    principal: (context: Context<AuthEnv>) => {
      const userId = context.get('auth')?.user?.id;
      if (!userId) {
        // The provider's scoped middleware runs first; this only guards against a
        // route contribution accidentally being mounted without it.
        throw new Error('IT ticket file routes require an authenticated user.');
      }
      return userId;
    },
    repositories: [
      {
        name: 'itTicketFiles',
        collection: 'itTicketFiles',
        disk: 'local',
        accessPath: '/uploads/it-tickets',
        actions: {
          uploadOne: { maxSize: 5 * 1024 * 1024 },
          uploadMany: { maxSize: 20 * 1024 * 1024 },
        },
        policy: (userId) => ({
          create: {
            scope: true,
            defaults: { uploadedById: userId },
            fields: FILE_COLUMNS,
            relations: {},
          },
          read: {
            scope: true,
            fields: FILE_COLUMNS,
            relations: {},
          },
          update: false,
          delete: false,
        }),
      },
    ],
  });
