import type {
  DatabaseFilter,
  DatabaseFilterOperator,
} from '@nocobase/app-plugin-authorization';
import type {
  ComparisonOperator,
  Expression,
  ExpressionBuilder,
  SqlBool,
} from '@nocobase/db';

/**
 * Translates the authorization Filter AST into query-builder expressions.
 *
 * The database authorizer validates the AST against the registered collection fields before it
 * reaches this adapter; this is the one place that knows how to turn it into SQL. It stays next to
 * the retail service rather than being spread through it.
 */
const operators: Readonly<Record<DatabaseFilterOperator, ComparisonOperator>> =
  {
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
 * Compiles a filter into an expression that can be added with `where()`.
 *
 * An all-records filter (`{ $and: [] }`) compiles to an empty `and` group, which adds no
 * condition, so the caller may always apply the result.
 */
export function compileAuthorizationFilter(
  eb: ExpressionBuilder,
  filter: DatabaseFilter,
): Expression<SqlBool> {
  const entries = Object.entries(filter);
  if (entries.length === 0) return eb.and([]);

  const expressions = entries.map(([field, value]) => {
    if (field === '$and' || field === '$or') {
      if (!Array.isArray(value)) {
        throw new TypeError(`${field} must be an array`);
      }
      const nested = value.map((item) =>
        compileAuthorizationFilter(eb, item as DatabaseFilter),
      );
      return field === '$and' ? eb.and(nested) : eb.or(nested);
    }

    return eb.and(
      Object.entries(value as Readonly<Record<string, unknown>>).map(
        ([operator, expected]) => {
          const comparison = operators[operator as DatabaseFilterOperator];
          if (!comparison) {
            throw new TypeError(`Unknown filter operator: ${operator}`);
          }
          return eb(field, comparison, expected);
        },
      ),
    );
  });

  return expressions.length === 1 ? expressions[0] : eb.and(expressions);
}
