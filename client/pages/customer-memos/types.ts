/** A customer memo as the API returns it. */
export interface CustomerMemo {
  readonly id: number;
  readonly customerName: string;
  readonly note: string | null;
  readonly createdAt: string;
}
