import type { WorkflowRunFunction } from '@nocobase/app-plugin-workflow';
import { runAcceptance } from './accept.ts';

/** Urgent branch: acceptance with the short due window chosen by the service. */
export const run: WorkflowRunFunction = (rawArgs, options) =>
  runAcceptance(rawArgs, options, 'urgent');
