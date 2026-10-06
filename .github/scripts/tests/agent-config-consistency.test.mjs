import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { AGENT_SETTING_NAMES } from '../agent-configuration.mjs';

// Every workflow that runs the configured Agent builds FACTORY_AGENT_CONFIG_JSON
// from the same allowlist by hand. agent-configuration.test.mjs checks that each
// copy carries exactly AGENT_SETTING_NAMES; this test keeps the copies one text,
// so a setting added to one workflow cannot drift from the others in spelling,
// order or expression.
const directory = new URL('../../workflows/', import.meta.url);
const blocks = readdirSync(directory)
  .filter((name) => name.endsWith('.yml'))
  .flatMap((name) => {
    const source = readFileSync(new URL(name, directory), 'utf8');
    const lines = source.split('\n');
    const start = lines.findIndex((line) =>
      /^\s*FACTORY_AGENT_CONFIG_JSON:/.test(line),
    );
    if (start < 0) return [];
    const indent = /^\s*/.exec(lines[start])[0].length;
    const body = [];
    for (const line of lines.slice(start + 1)) {
      // The folded scalar ends at the first line indented no deeper than its key.
      if (line.trim() !== '' && /^\s*/.exec(line)[0].length <= indent) break;
      body.push(line.trim());
    }
    while (body.at(-1) === '') body.pop();
    return [{ name, block: [lines[start].trim(), ...body].join('\n') }];
  });

test('every workflow builds FACTORY_AGENT_CONFIG_JSON from one identical block', () => {
  assert.ok(
    blocks.length >= 2,
    'expected several workflows to pass Agent settings',
  );
  const [reference, ...others] = blocks;
  for (const { name, block } of others) {
    assert.equal(
      block,
      reference.block,
      `${name} builds FACTORY_AGENT_CONFIG_JSON differently from ${reference.name}`,
    );
  }
});

test('each setting in the block is read from the repository variable of the same name', () => {
  const { block } = blocks[0];
  assert.match(block, /^FACTORY_AGENT_CONFIG_JSON: >-\n\{\n/);
  assert.match(block, /\n\}$/);
  const entries = block.split('\n').slice(2, -1);
  assert.deepEqual(
    entries.map((line) => {
      const match =
        /^"([A-Z0-9_]+)": \$\{\{ toJSON\(vars\.([A-Z0-9_]+)\) \}\}(,?)$/.exec(
          line,
        );
      assert.ok(match, line);
      assert.equal(match[1], match[2], line);
      return match[1];
    }),
    AGENT_SETTING_NAMES,
  );
  // Every entry but the last carries the comma that keeps the JSON valid.
  assert.ok(entries.slice(0, -1).every((line) => line.endsWith(',')));
  assert.ok(!entries.at(-1).endsWith(','));
});
