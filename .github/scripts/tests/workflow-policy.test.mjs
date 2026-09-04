import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const workflow = readFileSync(
  path.resolve(import.meta.dirname, '..', '..', 'workflows', 'pi-task.yml'),
  'utf8',
);

test('an existing Pi work branch goes straight to verification and repair', () => {
  assert.match(
    workflow,
    /- name: Run Pi implementation\n\s+if: needs\.prepare\.outputs\.base_ref != needs\.prepare\.outputs\.work_branch/,
  );
});
