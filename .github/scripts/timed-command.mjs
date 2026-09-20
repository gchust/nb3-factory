import { spawnSync } from 'node:child_process';
import { recordTiming } from './timing.mjs';
const [stage, command, ...args] = process.argv.slice(2);
if (!stage || !command)
  throw new Error('Usage: timed-command.mjs <stage> <command> [args]');
const started = Date.now();
const result = spawnSync(command, args, { stdio: 'inherit' });
recordTiming(stage, started, result.status ?? 1);
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
