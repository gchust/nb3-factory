// @vitest-environment node

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { serviceRequestWorkflowStepsToken as contractToken } from '../../server/workflows/service-request-acceptance/server/contracts.js';
import { serviceRequestWorkflowStepsToken as providerToken } from '../../server/providers/service-request-service.js';

const runModuleDirectory = fileURLToPath(
  new URL(
    '../../server/workflows/service-request-acceptance/server',
    import.meta.url,
  ),
);

/** Matches a value import; `import type` is erased before the module ships. */
const valueImportPattern =
  /\bimport\s+(?!type\b)([\s\S]*?)\bfrom\s*['"]([^'"]+)['"]/gu;

function bareValueImports(source: string): string[] {
  const withoutComments = source
    .replaceAll(/\/\*[\s\S]*?\*\//gu, '')
    .replaceAll(/\/\/[^\n]*/gu, '');
  return [...withoutComments.matchAll(valueImportPattern)]
    .map((match) => match[2] ?? '')
    .filter((specifier) => !specifier.startsWith('.'));
}

describe('service request acceptance workflow', () => {
  it('spells the step token identically in the contract and the provider', () => {
    // The artifact holds its own copy of the contract module, so the token is
    // matched by value rather than by object identity.
    expect(contractToken).toBe(providerToken);
    expect(contractToken).toBe('service-request/workflow-steps');
  });

  it.each(
    readdirSync(runModuleDirectory).filter((name) => name.endsWith('.ts')),
  )('keeps %s free of bare value imports', (file) => {
    // Production materializes these modules into an isolated Artifact store
    // that is not guaranteed to be inside the application's `node_modules`, so
    // a bare specifier there would fail to resolve at run time. They reach the
    // application through the local contract's token instead.
    const source = readFileSync(`${runModuleDirectory}/${file}`, 'utf8');
    expect(bareValueImports(source)).toEqual([]);
  });
});
