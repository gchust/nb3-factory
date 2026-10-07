interface Input {
  readonly workOrderId: string;
  readonly orderNo: string;
  readonly priority: 'urgent' | 'normal';
}

/**
 * The workflow's only branch: an urgent order is fulfilled by `acceptUrgent`,
 * everything else by `acceptNormal`.
 */
export function run({ input }: { readonly input: Input }): boolean {
  return input.priority === 'urgent';
}
