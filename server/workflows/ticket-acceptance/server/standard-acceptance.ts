import type { WorkflowRunFunction } from '@nocobase/app-plugin-workflow';

import { registerAcceptanceNode } from './register-acceptance.js';

/** The ordinary branch: assigns with the standard follow-up note and notifies the engineer. */
export const run: WorkflowRunFunction = registerAcceptanceNode('normal');
