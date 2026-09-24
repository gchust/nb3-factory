import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import { defineFileRepositoryApiRoutes } from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import type {
  AppApiRouteContribution,
  AppRootRouteContribution,
  AppRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

/** The URL segment and client repository name for this feature's uploads. */
export const DOCUMENT_ATTACHMENT_REPOSITORY = 'documentAttachments';
/** The application-owned file metadata table the uploads are stored in. */
export const DOCUMENT_ATTACHMENT_FILES_COLLECTION = 'document_files';
export const DOCUMENT_ATTACHMENT_DISK = 'local';
/** The public byte path; one UUID is the capability that grants one file. */
export const DOCUMENT_ATTACHMENT_ACCESS_PATH = '/uploads/documents';

const contributions = defineFileRepositoryApiRoutes({
  repositories: [
    {
      name: DOCUMENT_ATTACHMENT_REPOSITORY,
      collection: DOCUMENT_ATTACHMENT_FILES_COLLECTION,
      disk: DOCUMENT_ATTACHMENT_DISK,
      accessPath: DOCUMENT_ATTACHMENT_ACCESS_PATH,
      policy: { read: false, create: true, update: false, delete: false },
      actions: { uploadOne: {} },
    },
  ],
});

/**
 * The File plugin's routes are public by design — authentication and
 * authorization are the application's to install. This feature only uploads,
 * so the wrapper guards exactly the upload path. The byte route stays public:
 * an unguessable UUID is the capability that grants one file's bytes, and the
 * browser requests it without a separate session for `<img>` and downloads.
 */
function requireAuthentication(
  contribution: AppApiRouteContribution<Application>,
): AppApiRouteContribution<Application> {
  return {
    scope: 'api',
    async createRouter(app) {
      const auth = app.container.resolve(authenticationToken);
      const router = new Hono();
      router.use(
        `/${DOCUMENT_ATTACHMENT_REPOSITORY}:uploadOne`,
        auth.required(),
      );
      router.route('/', await contribution.createRouter(app));
      return router;
    },
  };
}

const apiContribution =
  contributions[0] as AppApiRouteContribution<Application>;
const rootContribution =
  contributions[1] as AppRootRouteContribution<Application>;

export const documentAttachmentFileRoutes: readonly AppRouteContribution<Application>[] =
  [requireAuthentication(apiContribution), rootContribution];
