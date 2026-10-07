import type { FileRecord } from '@/extensions/nocobase-file-component-ui';

import type { ClaimInput, Department, ExpenseCategory } from './types.js';

/**
 * The claim form's shape and its pure helpers.
 *
 * They live apart from `claim-form.tsx` because a file that exports both a component and a plain value cannot keep its
 * component state across edits: the React Fast Refresh rule is that a module either exports components or it does not.
 * The editor imports these helpers and the component side by side.
 */

/** The collection the file plugin's File Repository reads and writes; keep in step with `server/routes/expense-files.ts`. */
export const EXPENSE_INVOICE_REPOSITORY = 'expenseInvoiceFiles';

/** One editable expense line. `key` is the React list key; ids never change while editing. */
export interface ClaimFormItem {
  readonly key: string;
  readonly category: ExpenseCategory | '';
  /** Held as text so a half-typed number survives; converted on submit. */
  readonly amount: string;
  readonly expenseDate: string;
  readonly description: string;
  readonly invoices: readonly FileRecord[];
}

export interface ClaimFormValues {
  readonly title: string;
  /** Empty means "my own department", which the server resolves. */
  readonly departmentId: string;
  readonly remark: string;
  readonly items: readonly ClaimFormItem[];
}

export interface ClaimFormErrors {
  readonly title?: string;
  readonly items?: string;
  readonly line?: Readonly<
    Record<number, { readonly category?: string; readonly amount?: string }>
  >;
}

export interface ClaimFormProps {
  readonly values: ClaimFormValues;
  readonly onChange: (values: ClaimFormValues) => void;
  readonly departments: readonly Department[];
  readonly disabled?: boolean;
  readonly errors?: ClaimFormErrors;
  /** The department the server would pick for the signed-in user, named in the "default" option. */
  readonly defaultDepartmentName?: string;
}

let lineSequence = 0;

/** A fresh, empty expense line. Exported so the pages can create the first one and append more. */
export function newClaimFormItem(
  category: ExpenseCategory | '' = '',
): ClaimFormItem {
  lineSequence += 1;
  return {
    key: `line-${lineSequence}`,
    category,
    amount: '',
    expenseDate: '',
    description: '',
    invoices: [],
  };
}

/** The total of the lines as the user types, so the page can show it before the server recomputes it. */
export function claimFormTotal(items: readonly ClaimFormItem[]): number {
  return items.reduce((sum, item) => {
    const amount = Number(item.amount);
    return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
  }, 0);
}

/**
 * Validate the form and turn it into the endpoint's input.
 *
 * The server validates again — it never trusts a client total — but a round trip is a slow way to learn that a line
 * has no amount, so the same rules are checked here and reported inline.
 */
export function buildClaimInput(values: ClaimFormValues): {
  readonly input?: ClaimInput;
  readonly errors?: ClaimFormErrors;
} {
  const line: Record<number, { category?: string; amount?: string }> = {};
  values.items.forEach((item, index) => {
    const lineError: { category?: string; amount?: string } = {};
    if (!item.category) {
      lineError.category = 'required';
    }
    const amount = Number(item.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      lineError.amount = 'required';
    }
    if (Object.keys(lineError).length) {
      line[index] = lineError;
    }
  });
  const errors: ClaimFormErrors = {
    title: values.title.trim() ? undefined : 'required',
    items: values.items.length === 0 ? 'empty' : undefined,
    line: Object.keys(line).length ? line : undefined,
  };
  if (errors.title || errors.items || errors.line) {
    return { errors };
  }
  return {
    input: {
      title: values.title.trim(),
      departmentId: values.departmentId || null,
      remark: values.remark.trim() || null,
      items: values.items.map((item) => {
        const invoice = item.invoices[0];
        return {
          category: item.category as ExpenseCategory,
          amount: Number(item.amount),
          expenseDate: item.expenseDate || null,
          description: item.description.trim() || null,
          invoiceId: invoice?.id ?? null,
          invoiceName: invoice?.filename ?? null,
          invoiceExt: invoice?.ext ?? null,
          invoiceType: invoice?.mimeType ?? null,
        };
      }),
    },
  };
}
