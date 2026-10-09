/**
 * NocoBase 3 leaves `createdAt` and `updatedAt` to the application: the
 * migration declares the columns `not null`, and no Repository fills them in.
 * Every write therefore states them, the same way the framework's own stores
 * do. Keeping the two helpers here means a business write cannot forget one.
 */

/** A create stamps both columns. */
export function stamped<T extends object>(
  values: T,
): T & { createdAt: string; updatedAt: string } {
  const now = new Date().toISOString();
  return { ...values, createdAt: now, updatedAt: now };
}

/** A create on a table that only tracks creation time. */
export function createdAtStamp<T extends object>(
  values: T,
): T & { createdAt: string } {
  return { ...values, createdAt: new Date().toISOString() };
}

/** An update moves `updatedAt` and leaves `createdAt` alone. */
export function touched<T extends object>(
  values: T,
): T & { updatedAt: string } {
  return { ...values, updatedAt: new Date().toISOString() };
}
