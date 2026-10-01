import type { AuthorizationContext } from '@nocobase/authorization/core';

/** What a business service needs from the request. It never receives a Hono context. */
export interface ServiceContext {
  readonly authorization: AuthorizationContext;
}

/** The signed-in user's id, or `null` for a non-user principal such as an API key. */
export function actorId(context: ServiceContext): string | null {
  const principal = context.authorization.identity.principal;
  return principal.type === 'user' ? principal.id : null;
}

/** True when the principal is an interactive user account rather than an integration credential. */
export function isUserPrincipal(context: ServiceContext): boolean {
  return context.authorization.identity.principal.type === 'user';
}

export function nowDate(): Date {
  return new Date();
}

export function newId(): string {
  return crypto.randomUUID();
}

/** Number of items a list request may return at once. */
export const MAX_PAGE_SIZE = 100;

export function normalizePaging(query: {
  readonly page?: number;
  readonly pageSize?: number;
}): { page: number; pageSize: number; offset: number } {
  const page =
    Number.isFinite(query.page) && (query.page as number) > 0
      ? Math.floor(query.page as number)
      : 1;
  const requested =
    Number.isFinite(query.pageSize) && (query.pageSize as number) > 0
      ? Math.floor(query.pageSize as number)
      : 20;
  const pageSize = Math.min(requested, MAX_PAGE_SIZE);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export interface PagedResult<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export function paged<T>(
  items: readonly T[],
  total: number,
  paging: { page: number; pageSize: number },
): PagedResult<T> {
  return { items, total, page: paging.page, pageSize: paging.pageSize };
}
