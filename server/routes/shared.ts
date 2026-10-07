import type { AuthEnv } from '@nocobase/app-plugin-authentication';
import type { AuthorizationEnv } from '@nocobase/app-plugin-authorization';
import {
  ApiError,
  apiErrorHandler,
  type ApiErrorStatus,
} from '@nocobase/app-server/router';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';

import {
  DOCUMENT_CENTER_SETTINGS_ID,
  DocumentCenterError,
  type DocumentCenterErrorCode,
} from '../providers/document-center.js';

/** The context variables every Document Center route reads: its session and its authorization. */
export type DocumentCenterEnv = {
  Variables: AuthEnv['Variables'] & AuthorizationEnv['Variables'];
};

/** The domain every Document Center error reason belongs to. */
export const DOCUMENT_CENTER_DOMAIN = 'documentCenter';

const ERROR_STATUS: Readonly<Record<DocumentCenterErrorCode, ApiErrorStatus>> =
  {
    DOCUMENT_NOT_FOUND: 'NOT_FOUND',
    DOCUMENT_ACCESS_DENIED: 'PERMISSION_DENIED',
    DOCUMENT_VERSION_CONFLICT: 'ABORTED',
    DOCUMENT_CODE_TAKEN: 'ALREADY_EXISTS',
    DOCUMENT_DEPARTMENTS_REQUIRED: 'FAILED_PRECONDITION',
    DEPARTMENT_NOT_FOUND: 'NOT_FOUND',
    DEPARTMENT_CODE_TAKEN: 'ALREADY_EXISTS',
    DEPARTMENT_MEMBER_NOT_FOUND: 'NOT_FOUND',
    DEPARTMENT_MEMBER_EXISTS: 'ALREADY_EXISTS',
    BACKUP_NOT_FOUND: 'NOT_FOUND',
    RESTORE_CONFIRMATION_REQUIRED: 'FAILED_PRECONDITION',
  };

/** The standard API error for a domain failure, or `undefined` for anything else. */
export function toDocumentCenterApiError(error: unknown): ApiError | undefined {
  if (!(error instanceof DocumentCenterError)) return undefined;
  return new ApiError({
    status: ERROR_STATUS[error.code],
    reason: error.code,
    domain: DOCUMENT_CENTER_DOMAIN,
    message: error.message,
    cause: error,
  });
}

/**
 * The `onError` every Document Center router installs: it translates the
 * domain errors and delegates the rest to the framework handler.
 */
export function documentCenterErrorHandler(
  error: unknown,
  context: Context<DocumentCenterEnv>,
): Response {
  return apiErrorHandler(
    toDocumentCenterApiError(error) ?? error,
    context as Context,
  );
}

/**
 * Requires the `manage` action on the Document Center settings item. It is
 * registered per route (or per admin-only router), never on a router mounted at
 * `/api`, whose wildcard would leak into contributions mounted later.
 */
export function requireManage() {
  return createMiddleware<DocumentCenterEnv>(async (context, next) => {
    await context.get('authz').require({
      resource: { type: 'settings', id: DOCUMENT_CENTER_SETTINGS_ID },
      action: 'manage',
    });
    await next();
  });
}
