import type {
  DatabaseFieldFilter,
  DatabaseFilter,
  DatabaseFilterOperator,
} from '@nocobase/app-plugin-authorization';
import type {
  ComparisonOperator,
  Expression,
  ExpressionBuilder,
  SqlBool,
} from '@nocobase/db';

const filterOperators: Readonly<
  Record<DatabaseFilterOperator, ComparisonOperator>
> = {
  $eq: '=',
  $ne: '!=',
  $in: 'in',
  $notIn: 'not in',
  $gt: '>',
  $gte: '>=',
  $lt: '<',
  $lte: '<=',
};

/**
 * True when the filter can never match a row.
 *
 * The authorization AST spells "no records" as an empty `$or`. The query
 * builder treats an empty logical group as no condition at all, so the route
 * must reject such a filter explicitly instead of compiling it.
 */
export function containsNoRecordsFilter(filter: DatabaseFilter): boolean {
  for (const [field, value] of Object.entries(filter)) {
    if (field === '$and' || field === '$or') {
      if (!Array.isArray(value)) return true;
      if (field === '$or' && value.length === 0) return true;
      if (
        (value as readonly DatabaseFilter[]).some((item) =>
          containsNoRecordsFilter(item),
        )
      ) {
        return true;
      }
      continue;
    }
    if (!value || Array.isArray(value)) return true;
  }
  return false;
}

/**
 * Translate the Filter AST returned by the authorization decision into the
 * database query builder, so record conditions run in the same `WHERE` clause
 * as the rest of the query instead of being applied in memory.
 */
export function compileDatabaseFilter(
  eb: ExpressionBuilder,
  filter: DatabaseFilter,
): Expression<SqlBool> {
  const expressions: Expression<SqlBool>[] = [];

  for (const [field, value] of Object.entries(filter)) {
    if (field === '$and' || field === '$or') {
      if (!Array.isArray(value)) {
        throw new TypeError(`${field} must be an array`);
      }
      if (field === '$or' && value.length === 0) {
        // Failing loudly beats compiling to "no condition", which would match
        // every row — the opposite of what an empty $or means.
        throw new TypeError('An empty $or filter matches no records');
      }
      const nested = (value as readonly DatabaseFilter[]).map((item) =>
        compileDatabaseFilter(eb, item),
      );
      expressions.push(field === '$and' ? eb.and(nested) : eb.or(nested));
      continue;
    }
    const fieldFilter = value as DatabaseFieldFilter;
    expressions.push(
      eb.and(
        Object.entries(fieldFilter).map(([operator, expected]) => {
          const comparison =
            filterOperators[operator as DatabaseFilterOperator];
          if (!comparison) {
            throw new TypeError(`Unknown filter operator: ${operator}`);
          }
          return eb(field, comparison, expected);
        }),
      ),
    );
  }

  return eb.and(expressions);
}
