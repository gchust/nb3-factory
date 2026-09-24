import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { contractOf, examples } from '../../contracts/render-examples.mjs';
import { loadContract, validateSchema } from '../json-schema.mjs';

const directory = path.resolve(import.meta.dirname, '../../contracts/examples');
const read = file => JSON.parse(readFileSync(path.join(directory, file), 'utf8'));

test('checked-in examples are generated from the exporter and match their contracts', async () => {
  const { valid, invalid } = await examples();
  for (const [name, value] of Object.entries(valid)) {
    assert.deepEqual(read(name), value, `${name} is out of date; run node .github/contracts/render-examples.mjs`);
    assert.deepEqual(validateSchema(loadContract(contractOf(name)), value), [], name);
  }
  for (const [name, value] of Object.entries(invalid)) {
    assert.deepEqual(read(`invalid/${name}`), value, name);
    assert.ok(validateSchema(loadContract(contractOf(name)), value).length > 0, `${name} must be rejected`);
  }
  assert.deepEqual(readdirSync(directory).filter(f => f.endsWith('.json')).sort(), Object.keys(valid).sort());
  // Five required outcome classes: success, failure, blocked, partial and legacy.
  for (const name of ['report-completed.json', 'report-failed.json', 'report-blocked.json', 'report-partial-handoff.json', 'report-legacy-v1-with-v2.json'])
    assert.ok(valid[name], name);
  assert.equal(valid['report-late-older.json'].precedence.knownLaterExecutions, 1);
  const batch = valid['batch-in-progress.json'];
  assert.deepEqual(batch.samples.map(s => [s.state, s.report.state]), [['passed', 'available'], ['running', 'missing'], ['planned', 'missing']]);
});

test('the validator enforces every keyword it is given and rejects unknown ones', () => {
  assert.throws(() => validateSchema({ type: 'object', patternProperties: {} }, {}), /Unsupported schema keyword/);
  assert.throws(() => validateSchema({ $ref: 'https://example.org/x' }, {}), /Unsupported schema reference/);
  assert.deepEqual(validateSchema({ type: 'string', format: 'date-time' }, '2026-09-25T00:00:00Z'), []);
  assert.ok(validateSchema({ type: 'string', format: 'date-time' }, '2026-09-25 00:00').length);
  assert.ok(validateSchema({ oneOf: [{ type: 'integer' }, { minimum: 0 }] }, 3).length, 'oneOf requires exactly one');
  for (const name of ['evaluation-report.v1', 'evaluation-bundle.v1', 'evaluation-receipt.v1', 'evaluation-batch.v1']) assert.equal(loadContract(name).$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.throws(() => loadContract('../secrets'), /Invalid contract/);
});
