import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseAcceptanceCriteria, identifyCheck } from './acceptance-criteria.mjs';

// A focused run can reject a repair, never authorize delivery. The caller must
// still run the original metadata against a fresh database before publishing.
export function retestMetadata(metadata, report) {
  const failed = report?.checks?.filter((check) => check.status === 'failed');
  if (!failed?.length) throw new Error('Focused QA needs observed failed criteria');
  const criteria = parseAcceptanceCriteria(metadata.task.acceptanceCriteria);
  const ids = [...new Set(failed.map((check) => identifyCheck(check, criteria).id))];
  if (ids.length >= criteria.length) return null;
  return {
    ...metadata,
    task: { ...metadata.task, qaScope: 'focused', qaCriteriaIds: ids },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [metadata, report, output] = process.argv.slice(2);
  if (!metadata || !report || !output)
    throw new Error('Usage: qa-retest.mjs metadata report output');
  const focused = retestMetadata(
    JSON.parse(readFileSync(metadata, 'utf8')),
    JSON.parse(readFileSync(report, 'utf8')),
  );
  if (focused) writeFileSync(output, JSON.stringify(focused));
  else rmSync(output, { force: true });
}
