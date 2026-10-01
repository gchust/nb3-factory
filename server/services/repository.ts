import type {
  CreateOneOptions,
  DatabaseConnection,
  DeleteManyOptions,
  DeleteManyResult,
  DeleteOneOptions,
  DeleteOneResult,
  FilterOnlyOptions,
  FindManyOptions,
  FindOneOptions,
  RepositoryPolicy,
  SingleMutationResult,
  UpdateManyOptions,
  UpdateManyResult,
  UpdateOneOptions,
} from '@nocobase/db';

/**
 * A Policy-bound Repository seen through the record type a service already knows.
 *
 * `withPolicy` degrades a bound record to `Partial<T>` because a Policy's read allowlist may be
 * smaller than the Collection. Every policy this application binds grants the complete declared
 * field set for its collection, so the full row type is stated once here instead of guarding every
 * property access at runtime. This is a typing seam only: the Policy is still enforced by the
 * Repository on every call.
 */
export interface ScopedRepository<T extends object> {
  findMany(options?: FindManyOptions<T>): PromiseLike<T[]>;
  findOne(options: FindOneOptions<T>): Promise<T | undefined>;
  count(options?: FilterOnlyOptions<T>): Promise<number>;
  createOne(
    options: CreateOneOptions<Partial<T>, T>,
  ): Promise<SingleMutationResult<T>>;
  updateOne(
    options: UpdateOneOptions<Partial<T>, T>,
  ): Promise<SingleMutationResult<T>>;
  updateMany(
    options: UpdateManyOptions<T, Partial<T>>,
  ): Promise<UpdateManyResult>;
  deleteOne(options: DeleteOneOptions<T>): Promise<DeleteOneResult>;
  deleteMany(options: DeleteManyOptions<T>): Promise<DeleteManyResult>;
}

export function scopedRepository<T extends object>(
  connection: DatabaseConnection,
  collection: string,
  policy: RepositoryPolicy,
): ScopedRepository<T> {
  return connection
    .repository<T>(collection)
    .withPolicy(
      policy as RepositoryPolicy<T>,
    ) as unknown as ScopedRepository<T>;
}
