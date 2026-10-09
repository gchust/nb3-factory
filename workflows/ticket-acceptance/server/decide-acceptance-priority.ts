import type { FlowContext } from '../workflow';

/**
 * The acceptance-note rule: an urgent ticket takes the urgent branch so its
 * acceptance note and owner notification say the work is to be prioritised;
 * every other accepted ticket takes the ordinary branch. The state transition
 * is identical on both branches; only the note recorded with it differs.
 */
export function run({ input }: FlowContext): boolean {
  return input.priority === 'urgent';
}
