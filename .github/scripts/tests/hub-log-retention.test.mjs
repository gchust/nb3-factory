import assert from 'node:assert/strict';
import test from 'node:test';
import { scrubHubLog } from '../hub-smoke.mjs';

test('Hub diagnostics preserve actual JSON and text while redacting credentials', () => {
  const text = 'Starting Hub\nAUTH_SECRET=testing-secret-value\nListening on 127.0.0.1\n';
  const clean = scrubHubLog('hub-start.log', text);
  assert.match(clean, /Starting Hub/); assert.match(clean, /Listening on/);
  assert.doesNotMatch(clean, /testing-secret-value/);
  const logs = {enabled:true,entries:[{message:'Deploying application',secret:'example-secret'}]};
  const output = JSON.parse(scrubHubLog('deployment-log.json',JSON.stringify(logs)));
  assert.equal(output.entries[0].message,'Deploying application');
  assert.equal(output.entries[0].secret,'[REDACTED]');
  assert.equal(scrubHubLog('x.log','arbitrary-value',['arbitrary-value']), '[REDACTED]');
});
