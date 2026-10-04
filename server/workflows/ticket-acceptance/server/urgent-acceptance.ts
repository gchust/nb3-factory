import type { WorkflowRunFunction } from '@nocobase/app-plugin-workflow';

import { registerAcceptanceNode } from './register-acceptance.js';

/** The urgent branch: assigns with a 4-hour response note and notifies the engineer. */
export const run: WorkflowRunFunction = registerAcceptanceNode('urgent');
