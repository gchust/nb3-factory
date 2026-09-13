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

const OPERATORS: Readonly<Record<DatabaseFilterOperator, ComparisonOperator>> =
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
 * Compiles an authorization `DatabaseFilter` AST into a query condition.
 *
 * The Authorization database authorizer returns a filter for every granted
 * request. It is applied inside the same SQL statement as the record id so a
 * row outside the caller's scope simply does not match.
 */
export function compileDatabaseFilter(
  eb: ExpressionBuilder,
  filter: DatabaseFilter,
): Expression<SqlBool> {
  const expressions = Object.entries(filter).map(([field, value]) => {
    if (field === '$and' || field === '$or') {
      if (!Array.isArray(value)) {
        throw new TypeError(`${field} must be an array`);
      }
      const nested = (value as readonly DatabaseFilter[]).map((item) =>
        compileDatabaseFilter(eb, item),
      );
      return field === '$and' ? eb.and(nested) : eb.or(nested);
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError(`Invalid filter for ${field}`);
    }
    return eb.and(
      Object.entries(value as Readonly<Record<string, unknown>>).map(
        ([operator, expected]) => {
          const comparison = OPERATORS[operator as DatabaseFilterOperator];
          if (!comparison) {
            throw new TypeError(`Unknown filter operator: ${operator}`);
          }
          return eb(field, comparison, expected);
        },
      ),
    );
  });
  return eb.and(expressions);
}
