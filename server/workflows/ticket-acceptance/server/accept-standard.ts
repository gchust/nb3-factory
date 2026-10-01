import type { WorkflowRunFunction } from '@nocobase/app-plugin-workflow';
import { runAcceptance } from './accept.ts';

/** Standard branch: acceptance with the normal due window chosen by the service. */
export const run: WorkflowRunFunction = (rawArgs, options) =>
  runAcceptance(rawArgs, options, 'normal');
