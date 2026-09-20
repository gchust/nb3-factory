import { readFileSync, appendFileSync, existsSync } from 'node:fs';
const file = process.env.FACTORY_TIMINGS_FILE;
if (file && existsSync(file)) {
  const rows = readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const totals = new Map();
  for (const row of rows) {
    const total = totals.get(row.stage) ?? { ms: 0, count: 0, failed: 0 };
    total.ms += row.durationMs;
    total.count++;
    total.failed += Number(row.status !== 0);
    totals.set(row.stage, total);
  }
  const report = [
    '## Factory stage timings',
    '',
    'Nested stages overlap; do not sum them as wall time. Queue and end-to-end time remain in the task usage report.',
    '',
    '| Stage | Calls | Seconds | Failures |',
    '| --- | ---: | ---: | ---: |',
    ...[...totals].map(
      ([stage, value]) =>
        `| ${stage.replaceAll('|', '/')} | ${value.count} | ${(value.ms / 1000).toFixed(2)} | ${value.failed} |`,
    ),
    '',
  ].join('\n');
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
}
