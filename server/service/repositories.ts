import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { AuthorizationContext } from '@nocobase/authorization/core';
import type {
  DatabaseManager,
  Repository,
  RepositoryFilter,
  RepositoryPolicy,
} from '@nocobase/db';

/**
 * Turns the authorized action of a business route into a Repository.
 *
 * A route authorizes one composite action and then asks this service for the
 * collection policies that action produced, so no query runs outside the
 * permission model. The unrestricted accessors exist for work the caller has
 * already authorized — writing a ticket's audit event after the ticket check,
 * or a scheduled job acting as the system — and must not be reachable from a
 * request that has not checked anything.
 */
export class ServiceRepositories {
  constructor(
    private readonly database: DatabaseManager,
    private readonly authorization: AppAuthorization,
  ) {}

  /**
   * A Repository bound to one action of one composite resource.
   *
   * The result refuses a query the action did not license, and constrains
   * records and fields to what the acting permission set allows.
   */
  async forAction<TRecord extends object>(
    context: AuthorizationContext,
    resource: string,
    action: string,
    collection: string,
  ): Promise<Repository<TRecord>> {
    const policy = await this.authorization.database.policyFor(
      collection,
      context,
      { resource, action },
    );
    return this.bind<TRecord>(collection, policy);
  }

  /** A Repository with no permission constraints, for system work. */
  system<TRecord extends object>(collection: string): Repository<TRecord> {
    return this.database.repository<TRecord>(collection);
  }

  bind<TRecord extends object>(
    collection: string,
    policy: RepositoryPolicy,
  ): Repository<TRecord> {
    return this.database
      .repository<TRecord>(collection)
      .withPolicy(
        policy as RepositoryPolicy<TRecord>,
      ) as unknown as Repository<TRecord>;
  }

  /**
   * Insert one row.
   *
   * The values are passed through `never` on purpose: the field allowlist that
   * governs the insert lives in the bound policy and is enforced at runtime, so
   * repeating each collection's shape in a second compile-time type here would
   * only drift. Callers pass a `Partial<TRecord>`, so the keys are still
   * checked against the row interface.
   */
  async create<TRecord extends object>(
    repository: Repository<TRecord>,
    values: Partial<TRecord>,
  ): Promise<TRecord> {
    const result = await repository.createOne({ values: values as never });
    return result.record;
  }

  /** Update one row; the bound policy narrows both the predicate and the fields. */
  async update<TRecord extends object>(
    repository: Repository<TRecord>,
    filter: RepositoryFilter<TRecord>,
    values: Partial<TRecord>,
  ): Promise<TRecord> {
    const result = await repository.updateOne({
      filter,
      values: values as never,
    });
    return result.record;
  }
}
