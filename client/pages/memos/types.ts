/** A customer memo as returned by the memo API. */
export interface CustomerMemo {
  readonly id: number;
  readonly customerName: string;
  readonly content: string | null;
  readonly createdAt: string;
}

/** The editable fields of a memo. */
export interface MemoFormValues {
  readonly customerName: string;
  readonly content: string;
}
